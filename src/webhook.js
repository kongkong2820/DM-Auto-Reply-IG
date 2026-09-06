import {
  DEFAULT_FOLLOW_PROMPT_MESSAGE,
  DEFAULT_FOLLOW_RETRY_MESSAGE,
  getAppSetting,
  getReelConfig
} from "./db.js";
import {
  checkFollowStatus,
  sendPrivateReplyWithQuickReply,
  sendQuickReply,
  sendTextMessage
} from "./instagram.js";

const encoder = new TextEncoder();
const FOLLOW_PAYLOAD_PREFIX = "FOLLOW_CHECK:";
const INITIAL_BUTTON_TITLE = "팔로우 확인 🙌🏻";
const RETRY_BUTTON_TITLE = "팔로우 완료했어요 🙌🏻";

export async function handleWebhook(request, url, env, ctx) {
  if (request.method === "GET") {
    return verifyWebhook(url, env);
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, POST" }
    });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (
    !await isValidSignature(
      rawBody,
      signature,
      env.META_APP_SECRET
    )
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (payload.object !== "instagram") {
    return new Response("Ignored", { status: 200 });
  }

  console.log("Instagram webhook accepted", {
    autoReplyEnabled: env.ENABLE_AUTO_REPLY === "true"
  });

  if (env.ENABLE_AUTO_REPLY === "true") {
    ctx.waitUntil(processPayload(payload, env));
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processPayload(payload, env) {
  const commentEvents = extractCommentEvents(payload);
  const quickReplyEvents = extractQuickReplyEvents(payload);

  await Promise.all(
    commentEvents.map(async (event) => {
      try {
        const outcome = await processCommentEvent(event, env);
        console.log("Instagram comment processed", { outcome });
      } catch {
        console.error("Instagram comment processing failed");
      }
    })
  );

  await Promise.all(
    quickReplyEvents.map(async (event) => {
      try {
        const outcome = await processQuickReplyEvent(event, env);
        console.log("Instagram quick reply processed", { outcome });
      } catch {
        console.error("Instagram quick reply processing failed");
      }
    })
  );
}

async function processCommentEvent(event, env) {
  if (
    !event.mediaId ||
    !event.commenterId
  ) {
    return "missing_context";
  }

  if (event.commenterId === env.INSTAGRAM_ACCOUNT_ID) {
    return "own_account_ignored";
  }

  const config = await getReelConfig(env.DB, event.mediaId);

  if (config?.enabled !== 1) {
    return "config_missing_or_disabled";
  }

  const message = config.autoDmMessage.trim();

  if (!message) {
    return "message_empty";
  }

  const configuredKeywords = config.commentKeywords.trim()
    ? config.commentKeywords
    : await getAppSetting(env.DB, "COMMENT_KEYWORDS");

  if (!matchesKeyword(event.text, configuredKeywords)) {
    return "keyword_not_matched";
  }

  const followPromptMessage = await getCommonMessage(
    env.DB,
    "FOLLOW_PROMPT_MESSAGE",
    DEFAULT_FOLLOW_PROMPT_MESSAGE
  );

  if (!followPromptMessage) {
    return "follow_prompt_empty";
  }

  await sendPrivateReplyWithQuickReply(
    event.commentId,
    followPromptMessage,
    followQuickReply(INITIAL_BUTTON_TITLE, event.mediaId),
    env
  );
  return "follow_prompt_sent";
}

async function processQuickReplyEvent(event, env) {
  if (
    !event.senderId ||
    event.senderId === env.INSTAGRAM_ACCOUNT_ID ||
    !event.reelId
  ) {
    return "invalid_or_own_quick_reply";
  }

  const config = await getReelConfig(env.DB, event.reelId);

  if (config?.enabled !== 1) {
    return "config_missing_or_disabled";
  }

  const message = config.autoDmMessage.trim();

  if (!message) {
    return "message_empty";
  }

  if (await checkFollowStatus(event.senderId, env)) {
    await sendTextMessage(event.senderId, message, env);
    return "final_reply_sent";
  }

  const retryMessage = await getCommonMessage(
    env.DB,
    "FOLLOW_RETRY_MESSAGE",
    DEFAULT_FOLLOW_RETRY_MESSAGE
  );

  if (!retryMessage) {
    return "follow_retry_empty";
  }

  await sendQuickReply(
    event.senderId,
    retryMessage,
    followQuickReply(RETRY_BUTTON_TITLE, event.reelId),
    env
  );
  return "follow_retry_sent";
}

function extractCommentEvents(payload) {
  const events = [];

  for (const entry of payload.entry ?? []) {
    const candidates = [
      ...entry.field || entry.value
        ? [{ field: entry.field, value: entry.value }]
        : [],
      ...entry.changes ?? []
    ];

    for (const candidate of candidates) {
      if (
        candidate.field !== "comments" ||
        !candidate.value
      ) {
        continue;
      }

      const commentId =
        candidate.value.id ?? candidate.value.comment_id;
      const text = candidate.value.text?.trim();

      if (!commentId || !text) {
        continue;
      }

      events.push({
        commentId: String(commentId),
        text,
        commenterId: candidate.value.from?.id
          ? String(candidate.value.from.id)
          : null,
        mediaId: candidate.value.media?.id
          ? String(candidate.value.media.id)
          : null
      });
    }
  }

  return events;
}

function extractQuickReplyEvents(payload) {
  const events = [];

  for (const entry of payload.entry ?? []) {
    for (const messagingEvent of entry.messaging ?? []) {
      const payloadValue =
        messagingEvent.message?.quick_reply?.payload ??
        messagingEvent.postback?.payload;
      const reelId = parseFollowPayload(payloadValue);

      if (!reelId) {
        continue;
      }

      events.push({
        senderId: messagingEvent.sender?.id
          ? String(messagingEvent.sender.id)
          : null,
        reelId
      });
    }
  }

  return events;
}

function followQuickReply(title, reelId) {
  return {
    title,
    payload: `${FOLLOW_PAYLOAD_PREFIX}${reelId}`
  };
}

function parseFollowPayload(value) {
  if (
    typeof value !== "string" ||
    !value.startsWith(FOLLOW_PAYLOAD_PREFIX)
  ) {
    return null;
  }

  const reelId = value.slice(FOLLOW_PAYLOAD_PREFIX.length);
  return /^\d{1,64}$/.test(reelId) ? reelId : null;
}

async function getCommonMessage(db, key, fallback) {
  return (await getAppSetting(db, key) ?? fallback).trim();
}

function matchesKeyword(comment, configuredKeywords) {
  const normalizedComment = normalize(comment);
  const keywords = (configuredKeywords ?? "")
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map(normalize);

  return keywords.some((keyword) =>
    normalizedComment.includes(keyword)
  );
}

function normalize(value) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

function verifyWebhook(url, env) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === env.VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

async function isValidSignature(rawBody, signatureHeader, appSecret) {
  if (
    !signatureHeader?.startsWith("sha256=") ||
    !appSecret
  ) {
    return false;
  }

  const suppliedHex = signatureHeader
    .slice("sha256=".length)
    .toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(suppliedHex)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(rawBody)
    )
  );
  const supplied = hexToBytes(suppliedHex);
  let difference = 0;

  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }

  return difference === 0;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(
      hex.slice(index * 2, index * 2 + 2),
      16
    );
  }

  return bytes;
}

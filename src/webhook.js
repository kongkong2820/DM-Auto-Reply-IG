import { getAppSetting, getReelConfig } from "./db.js";
import {
  checkFollowStatus,
  sendPrivateReply
} from "./instagram.js";

const encoder = new TextEncoder();

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
    ctx.waitUntil(processCommentPayload(payload, env));
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}

async function processCommentPayload(payload, env) {
  const events = extractCommentEvents(payload);

  await Promise.all(
    events.map(async (event) => {
      try {
        const outcome = await processCommentEvent(event, env);
        console.log("Instagram comment processed", { outcome });
      } catch {
        console.error("Instagram comment processing failed");
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

  if (!await checkFollowStatus(event.commenterId, env)) {
    return "follow_not_verified";
  }

  await sendPrivateReply(event.commentId, message, env);
  return "reply_sent";
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

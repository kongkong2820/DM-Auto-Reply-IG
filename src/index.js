import { sendPrivateReply } from "./instagram.js";

var encoder = new TextEncoder();

var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" && request.method === "GET") {
      return Response.json({
        service: "Instagram Comment Auto DM",
        status: "ready",
        autoReply: env.ENABLE_AUTO_REPLY === "true"
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({
        ok: true,
        autoReply: env.ENABLE_AUTO_REPLY === "true",
        keywordsConfigured: parseKeywords(env.COMMENT_KEYWORDS).length > 0,
        replyConfigured: Boolean(env.PRIVATE_REPLY_MESSAGE?.trim())
      });
    }

    if (url.pathname === "/privacy" && request.method === "GET") {
      return privacyPolicyResponse();
    }

    if (url.pathname !== "/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method === "GET") {
      return verifyWebhook(url, env);
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
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

    if (env.ENABLE_AUTO_REPLY === "true") {
      ctx.waitUntil(processCommentPayload(payload, env));
    }

    return new Response("EVENT_RECEIVED", { status: 200 });
  }
};

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

async function processCommentPayload(payload, env) {
  const events = extractCommentEvents(payload);

  await Promise.all(
    events.map(async (event) => {
      try {
        const matched = matchesConfiguredKeyword(
          event.text,
          env.COMMENT_KEYWORDS,
          env.KEYWORD_MATCH_MODE
        );

        if (!matched) {
          return;
        }

        if (
          event.commenterId &&
          event.commenterId === env.INSTAGRAM_ACCOUNT_ID
        ) {
          return;
        }

        const reply = env.PRIVATE_REPLY_MESSAGE?.trim();

        if (!reply) {
          throw new Error(
            "PRIVATE_REPLY_MESSAGE is not configured"
          );
        }

        await sendPrivateReply(
          event.commentId,
          reply,
          env
        );
      } catch (error) {
        console.error(
          "Instagram private reply failed",
          {
            commentId: event.commentId,
            error:
              error instanceof Error
                ? error.message
                : String(error)
          }
        );
      }
    })
  );
}

function extractCommentEvents(payload) {
  const events = [];

  for (const entry of payload.entry ?? []) {
    const candidates = [
      ...entry.field || entry.value
        ? [{
            field: entry.field,
            value: entry.value
          }]
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
        candidate.value.id ??
        candidate.value.comment_id;

      const text =
        candidate.value.text?.trim();

      if (!commentId || !text) {
        continue;
      }

      events.push({
        commentId,
        text,
        commenterId:
          candidate.value.from?.id,
        username:
          candidate.value.from?.username,
        mediaId:
          candidate.value.media?.id
      });
    }
  }

  return events;
}

function matchesConfiguredKeyword(
  comment,
  configuredKeywords,
  matchMode
) {
  const normalizedComment = normalize(comment);

  const keywords = parseKeywords(
    configuredKeywords
  ).map(normalize);

  if (matchMode === "contains") {
    return keywords.some((keyword) =>
      normalizedComment.includes(keyword)
    );
  }

  return keywords.some((keyword) =>
    normalizedComment === keyword
  );
}

function parseKeywords(configuredKeywords) {
  return (configuredKeywords ?? "")
    .split(/[\n,]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function normalize(value) {
  return value
    .trim()
    .toLocaleLowerCase("ko-KR");
}

async function isValidSignature(
  rawBody,
  signatureHeader,
  appSecret
) {
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
    {
      name: "HMAC",
      hash: "SHA-256"
    },
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

  for (
    let index = 0;
    index < expected.length;
    index += 1
  ) {
    difference |=
      expected[index] ^ supplied[index];
  }

  return difference === 0;
}

function hexToBytes(hex) {
  const bytes =
    new Uint8Array(hex.length / 2);

  for (
    let index = 0;
    index < bytes.length;
    index += 1
  ) {
    bytes[index] = Number.parseInt(
      hex.slice(
        index * 2,
        index * 2 + 2
      ),
      16
    );
  }

  return bytes;
}

function privacyPolicyResponse() {
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    >
    <title>
      개인정보처리방침 |
      Instagram Comment Auto DM
    </title>
    <style>
      body {
        max-width: 760px;
        margin: 48px auto;
        padding: 0 20px;
        font-family: sans-serif;
        line-height: 1.7;
        color: #202124;
      }

      h1,
      h2 {
        line-height: 1.35;
      }

      h2 {
        margin-top: 32px;
      }
    </style>
  </head>
  <body>
    <h1>
      Instagram Comment Auto DM
      개인정보처리방침
    </h1>

    <p>시행일: 2026년 9월 5일</p>

    <h2>1. 처리하는 정보</h2>

    <p>
      서비스는 댓글 자동 DM 제공을 위해
      Instagram 댓글 작성자의 앱 범위 식별자와
      사용자명, 댓글 ID와 내용, 작성 시각 및
      게시물 ID를 처리할 수 있습니다.
    </p>

    <h2>2. 처리 목적</h2>

    <p>
      Instagram 댓글에 설정된 키워드가
      포함되었는지 확인하고, 조건에 일치하는
      댓글 작성자에게 설정된 비공개 메시지를
      전송하기 위해 사용합니다.
    </p>

    <h2>3. 보관 및 파기</h2>

    <p>
      댓글 내용과 작성자 정보는 별도
      데이터베이스에 저장하지 않습니다.
    </p>

    <h2>4. 제3자 서비스</h2>

    <p>
      서비스 제공 과정에서 Meta Instagram API와
      Cloudflare Workers를 이용합니다.
      처리 정보는 서비스 제공 목적 외에
      판매하거나 임의로 제공하지 않습니다.
    </p>

    <h2>5. 삭제 요청</h2>

    <p>
      개인정보 처리 또는 삭제에 관한 요청은
      본 서비스를 제공하는 Instagram 계정의
      DM으로 접수할 수 있습니다.
    </p>

    <h2>6. 방침 변경</h2>

    <p>
      본 방침이 변경되는 경우 이 페이지에
      변경 내용과 시행일을 게시합니다.
    </p>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type":
        "text/html; charset=UTF-8",
      "Cache-Control":
        "public, max-age=3600",
      "X-Content-Type-Options":
        "nosniff"
    }
  });
}

export {
  index_default as default
};

import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import worker from "../src/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createEnv(overrides = {}) {
  return {
    ENABLE_AUTO_REPLY: "true",
    GRAPH_API_VERSION: "v24.0",
    INSTAGRAM_ACCESS_TOKEN: "test-access-token",
    INSTAGRAM_ACCOUNT_ID: "business-account-id",
    KEYWORD_MATCH_MODE: "contains",
    META_APP_SECRET: "test-app-secret",
    PRIVATE_REPLY_MESSAGE: "테스트 답장",
    VERIFY_TOKEN: "test-verify-token",
    COMMENT_KEYWORDS: "자료,신청",
    ...overrides
  };
}

function createContext() {
  const pending = [];

  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    }
  };
}

function commentPayload({
  commentId = "comment-id",
  commenterId = "commenter-id",
  text = "자료 주세요"
} = {}) {
  return {
    object: "instagram",
    entry: [
      {
        changes: [
          {
            field: "comments",
            value: {
              id: commentId,
              text,
              from: {
                id: commenterId,
                username: "test-user"
              },
              media: {
                id: "media-id"
              }
            }
          }
        ]
      }
    ]
  };
}

async function signatureFor(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  );
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256=${hex}`;
}

async function postWebhook(body, env, context, signature) {
  return worker.fetch(
    new Request("https://example.com/webhook", {
      method: "POST",
      headers: {
        "x-hub-signature-256": signature
      },
      body
    }),
    env,
    context
  );
}

async function sendSignedPayload(payload, env = createEnv()) {
  const body = JSON.stringify(payload);
  const context = createContext();
  const signature = await signatureFor(body, env.META_APP_SECRET);
  const response = await postWebhook(body, env, context, signature);
  await Promise.all(context.pending);

  return response;
}

describe("public routes", () => {
  test("GET / returns service state", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/"),
      createEnv(),
      createContext()
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      service: "Instagram Comment Auto DM",
      status: "ready",
      autoReply: true
    });
  });

  test("GET /health reports current environment configuration", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/health"),
      createEnv(),
      createContext()
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      autoReply: true,
      keywordsConfigured: true,
      replyConfigured: true
    });
  });

  test("GET /privacy returns HTML and unknown routes return 404", async () => {
    const privacy = await worker.fetch(
      new Request("https://example.com/privacy"),
      createEnv(),
      createContext()
    );
    const missing = await worker.fetch(
      new Request("https://example.com/missing"),
      createEnv(),
      createContext()
    );

    assert.equal(privacy.status, 200);
    assert.match(privacy.headers.get("content-type"), /^text\/html/);
    assert.match(await privacy.text(), /개인정보처리방침/);
    assert.equal(missing.status, 404);
  });
});

describe("webhook verification", () => {
  test("GET /webhook accepts the configured verification token", async () => {
    const response = await worker.fetch(
      new Request(
        "https://example.com/webhook?hub.mode=subscribe" +
          "&hub.verify_token=test-verify-token&hub.challenge=challenge-value"
      ),
      createEnv(),
      createContext()
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "challenge-value");
  });

  test("GET /webhook rejects a different verification token", async () => {
    const response = await worker.fetch(
      new Request(
        "https://example.com/webhook?hub.mode=subscribe" +
          "&hub.verify_token=wrong&hub.challenge=challenge-value"
      ),
      createEnv(),
      createContext()
    );

    assert.equal(response.status, 403);
  });

  test("non-GET/POST webhook methods return 405", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/webhook", { method: "PUT" }),
      createEnv(),
      createContext()
    );

    assert.equal(response.status, 405);
  });
});

describe("webhook event handling", () => {
  test("rejects an invalid HMAC signature", async () => {
    const context = createContext();
    const response = await postWebhook(
      JSON.stringify(commentPayload()),
      createEnv(),
      context,
      `sha256=${"0".repeat(64)}`
    );

    assert.equal(response.status, 401);
    assert.equal(context.pending.length, 0);
  });

  test("rejects invalid JSON after a valid HMAC signature", async () => {
    const env = createEnv();
    const context = createContext();
    const body = "not-json";
    const signature = await signatureFor(body, env.META_APP_SECRET);
    const response = await postWebhook(body, env, context, signature);

    assert.equal(response.status, 400);
    assert.equal(context.pending.length, 0);
  });

  test("ignores a signed non-Instagram event", async () => {
    const response = await sendSignedPayload(
      { object: "page", entry: [] },
      createEnv()
    );

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "Ignored");
  });

  test("does not start background processing when auto reply is off", async () => {
    const env = createEnv({ ENABLE_AUTO_REPLY: "false" });
    const body = JSON.stringify(commentPayload());
    const context = createContext();
    const signature = await signatureFor(body, env.META_APP_SECRET);
    const response = await postWebhook(body, env, context, signature);

    assert.equal(response.status, 200);
    assert.equal(await response.text(), "EVENT_RECEIVED");
    assert.equal(context.pending.length, 0);
  });

  test("preserves comma/newline parsing and contains matching", async () => {
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 200 });
    };
    const env = createEnv({
      COMMENT_KEYWORDS: "자료,\n 신청",
      KEYWORD_MATCH_MODE: "contains"
    });

    const first = await sendSignedPayload(
      commentPayload({ commentId: "comment-1", text: "자료 부탁드려요" }),
      env
    );
    const second = await sendSignedPayload(
      commentPayload({ commentId: "comment-2", text: "저도 신청할게요" }),
      env
    );

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(requests.length, 2);
    assert.equal(
      requests[0].url,
      "https://graph.instagram.com/v24.0/business-account-id/messages"
    );
    assert.deepEqual(JSON.parse(requests[0].init.body), {
      recipient: { comment_id: "comment-1" },
      message: { text: "테스트 답장" }
    });
  });

  test("preserves exact matching when match mode is not contains", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      return new Response(null, { status: 200 });
    };
    const env = createEnv({ KEYWORD_MATCH_MODE: "exact" });

    await sendSignedPayload(commentPayload({ text: "자료 주세요" }), env);
    await sendSignedPayload(commentPayload({ text: "자료" }), env);

    assert.equal(requestCount, 1);
  });

  test("does not reply to a comment from the business account", async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
      requestCount += 1;
      return new Response(null, { status: 200 });
    };
    const env = createEnv();

    await sendSignedPayload(
      commentPayload({ commenterId: env.INSTAGRAM_ACCOUNT_ID }),
      env
    );

    assert.equal(requestCount, 0);
  });
});

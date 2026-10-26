import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { getMediaList } from "../src/instagram.js";
import { handleAdminApi, adminPageResponse } from "../src/admin.js";
import { createAdminSession, sessionCookie } from "../src/auth.js";
import { handleWebhook } from "../src/webhook.js";

const originalFetch = globalThis.fetch;
const reelId = "17890000000000001";
const carouselId = "17890000000000002";
const commenterId = "58990000000000001";

const mediaResponse = {
  data: [
    { id: reelId, caption: "릴스 제목\n설명", media_type: "VIDEO",
      media_product_type: "REELS", timestamp: "2026-10-21T00:00:00+0000" },
    { id: carouselId, caption: "캐러셀 제목\n설명",
      media_type: "CAROUSEL_ALBUM", media_product_type: "FEED",
      timestamp: "2026-10-20T00:00:00+0000" },
    { id: "17890000000000003", caption: "일반 이미지",
      media_type: "IMAGE", media_product_type: "FEED",
      timestamp: "2026-10-19T00:00:00+0000" },
    { id: "17890000000000004", caption: "일반 동영상",
      media_type: "VIDEO", media_product_type: "FEED",
      timestamp: "2026-10-18T00:00:00+0000" }
  ],
  paging: {}
};

function fakeDb() {
  const saved = new Map([
    [reelId, { reel_id: reelId, enabled: 1,
      auto_dm_message: "릴스 안내", comment_keywords: "신청" }],
    [carouselId, { reel_id: carouselId, enabled: 1,
      auto_dm_message: "캐러셀 안내", comment_keywords: "자료" }]
  ]);

  return {
    saved,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async first() {
          if (sql.includes("FROM reel_dm_config")) {
            return saved.get(args[0]) ?? null;
          }
          if (sql.includes("FROM app_settings")) return null;
          throw new Error("Unexpected select: " + sql);
        },
        async all() {
          if (sql.includes("FROM reel_dm_config")) {
            return { results: args.map((id) => saved.get(id)).filter(Boolean) };
          }
          throw new Error("Unexpected list: " + sql);
        },
        async run() {
          if (!sql.includes("INSERT INTO reel_dm_config")) {
            throw new Error("Unexpected mutation: " + sql);
          }
          const [id, message, keywords, enabled] = args;
          saved.set(id, { reel_id: id, auto_dm_message: message,
            comment_keywords: keywords, enabled });
          return { success: true };
        }
      };
    }
  };
}

function envFor(db) {
  return {
    DB: db,
    ENABLE_AUTO_REPLY: "true",
    GRAPH_API_VERSION: "v24.0",
    INSTAGRAM_ACCOUNT_ID: "17890000000009999",
    INSTAGRAM_ACCESS_TOKEN: "test-token",
    META_APP_SECRET: "test-secret",
    ADMIN_PASSWORD: "test-admin-password"
  };
}

function adminRequest(path, token, options = {}) {
  return new Request("https://example.com" + path, {
    ...options,
    headers: {
      Cookie: sessionCookie(token).split(";")[0],
      ...(options.headers ?? {})
    }
  });
}

async function signature(body, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  );
  return "sha256=" + [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function webhook(payload, env) {
  const body = JSON.stringify(payload);
  const req = new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": await signature(body, env.META_APP_SECRET) },
    body
  });
  const pending = [];
  const response = await handleWebhook(req, new URL(req.url), env, {
    waitUntil(promise) { pending.push(promise); }
  });
  await Promise.all(pending);
  assert.equal(response.status, 200);
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Reels and carousel auto DM", () => {
  test("lists Reels and carousel albums, excluding ordinary feed posts", async () => {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /\/me\/media\?/);
      return Response.json(mediaResponse);
    };

    const list = await getMediaList(envFor(fakeDb()), { limit: 20 });
    assert.deepEqual(list.data.map((media) => media.id), [reelId, carouselId]);
    assert.deepEqual(list.data.map((media) => media.mediaType),
      ["VIDEO", "CAROUSEL_ALBUM"]);
    assert.equal(list.data[1].caption, "캐러셀 제목\n설명");
  });

  test("admin displays type and saves carousel configuration", async () => {
    globalThis.fetch = async () => Response.json(mediaResponse);
    const db = fakeDb();
    const env = envFor(db);
    const token = await createAdminSession(env.ADMIN_PASSWORD);
    const request = adminRequest("/api/admin/reels?limit=20", token);
    const response = await handleAdminApi(request, new URL(request.url), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.length, 2);
    assert.equal(result.data[1].reelId, carouselId);
    assert.equal(result.data[1].mediaType, "CAROUSEL_ALBUM");
    assert.equal(result.data[1].title, "캐러셀 제목");
    assert.equal(result.data[1].autoDmMessage, "캐러셀 안내");

    const html = await adminPageResponse().text();
    assert.match(html, /<th>유형<\/th>/);
    assert.match(html, /"캐러셀" : "릴스"/);

    const save = adminRequest("/api/admin/reels/" + carouselId, token, {
      method: "PUT",
      headers: { Origin: "https://example.com", "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true, autoDmMessage: "캐러셀 수정 DM", commentKeywords: "예약"
      })
    });
    const saved = await handleAdminApi(save, new URL(save.url), env);
    assert.equal(saved.status, 200);
    assert.deepEqual((await saved.json()).data, {
      reelId: carouselId, enabled: 1,
      autoDmMessage: "캐러셀 수정 DM", commentKeywords: "예약"
    });
    assert.equal(db.saved.get(carouselId).auto_dm_message, "캐러셀 수정 DM");
  });

  test("carousel comment and follow confirmation deliver the configured DM", async () => {
    const sent = [];
    globalThis.fetch = async (url, options) => {
      const target = String(url);
      if (target.endsWith("/messages")) {
        sent.push(JSON.parse(options.body));
        return Response.json({ recipient_id: commenterId });
      }
      if (target.includes("fields=is_user_follow_business")) {
        return Response.json({ is_user_follow_business: true });
      }
      throw new Error("Unexpected external request: " + target);
    };
    const env = envFor(fakeDb());

    await webhook({
      object: "instagram",
      entry: [{ changes: [{ field: "comments", value: {
        id: "17990000000000001",
        text: "자료 부탁해요",
        from: { id: commenterId },
        media: { id: carouselId }
      } }] }]
    }, env);

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].recipient, { comment_id: "17990000000000001" });
    assert.equal(sent[0].message.quick_replies[0].payload,
      "FOLLOW_CHECK:" + carouselId);

    await webhook({
      object: "instagram",
      entry: [{ messaging: [{ sender: { id: commenterId },
        message: { quick_reply: { payload: "FOLLOW_CHECK:" + carouselId } }
      }] }]
    }, env);

    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1].recipient, { id: commenterId });
    assert.equal(sent[1].message.text, "캐러셀 안내");
  });
});

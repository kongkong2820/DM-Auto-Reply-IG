import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getAppSetting,
  getReelConfig,
  setAppSetting,
  upsertReelConfig
} from "../src/db.js";

class FakeD1Database {
  constructor() {
    this.reels = new Map();
    this.settings = new Map();
    this.queries = [];
  }

  prepare(sql) {
    this.queries.push(sql);
    return new FakeD1Statement(this, sql);
  }
}

class FakeD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.includes("FROM reel_dm_config")) {
      return this.db.reels.get(this.values[0]) ?? null;
    }

    if (this.sql.includes("FROM app_settings")) {
      const settingValue = this.db.settings.get(this.values[0]);
      return settingValue === undefined
        ? null
        : { setting_value: settingValue };
    }

    throw new Error("Unexpected SELECT query");
  }

  async run() {
    if (this.sql.includes("INSERT INTO reel_dm_config")) {
      const [
        reelId,
        autoDmMessage,
        commentKeywords,
        enabled
      ] = this.values;

      this.db.reels.set(reelId, {
        reel_id: reelId,
        auto_dm_message: autoDmMessage,
        comment_keywords: commentKeywords,
        enabled
      });

      return { success: true };
    }

    if (this.sql.includes("INSERT INTO app_settings")) {
      const [key, value] = this.values;
      this.db.settings.set(key, value);
      return { success: true };
    }

    throw new Error("Unexpected mutation query");
  }
}

describe("reel DM configuration", () => {
  test("returns null when a reel has no saved configuration", async () => {
    const db = new FakeD1Database();

    assert.equal(await getReelConfig(db, "reel-1"), null);
  });

  test("inserts and updates a reel with bound SQL parameters", async () => {
    const db = new FakeD1Database();
    const reelId = "reel-' OR 1=1";

    const inserted = await upsertReelConfig(db, {
      reelId,
      autoDmMessage: "첫 번째 메시지",
      commentKeywords: "자료,신청",
      enabled: true
    });
    const updated = await upsertReelConfig(db, {
      reelId,
      autoDmMessage: "수정된 메시지",
      commentKeywords: "수정",
      enabled: 1
    });

    assert.deepEqual(inserted, {
      reelId,
      autoDmMessage: "첫 번째 메시지",
      commentKeywords: "자료,신청",
      enabled: 1
    });
    assert.deepEqual(updated, {
      reelId,
      autoDmMessage: "수정된 메시지",
      commentKeywords: "수정",
      enabled: 1
    });
    assert.equal(
      db.queries.some((query) => query.includes(reelId)),
      false
    );
    assert.equal(
      db.queries.some((query) => query.includes("VALUES (?, ?, ?, ?)")),
      true
    );
  });

  for (const [label, autoDmMessage] of [
    ["null", null],
    ["empty", ""],
    ["whitespace", "   \n  "]
  ]) {
    test(`forces enabled off for a ${label} message`, async () => {
      const db = new FakeD1Database();

      const saved = await upsertReelConfig(db, {
        reelId: `reel-${label}`,
        autoDmMessage,
        commentKeywords: "자료",
        enabled: true
      });

      assert.equal(saved.enabled, 0);
    });
  }

  test("preserves message and keywords when only enabled changes", async () => {
    const db = new FakeD1Database();
    const values = {
      reelId: "reel-toggle",
      autoDmMessage: "보존할 메시지",
      commentKeywords: "자료,신청"
    };

    await upsertReelConfig(db, {
      ...values,
      enabled: true
    });
    const off = await upsertReelConfig(db, {
      reelId: values.reelId,
      enabled: false
    });
    const on = await upsertReelConfig(db, {
      reelId: values.reelId,
      enabled: true
    });

    assert.deepEqual(off, { ...values, enabled: 0 });
    assert.deepEqual(on, { ...values, enabled: 1 });
  });

  test("rejects invalid identifiers and enabled values", async () => {
    const db = new FakeD1Database();

    await assert.rejects(
      getReelConfig(db, "  "),
      /reelId must be a non-empty string/
    );
    await assert.rejects(
      upsertReelConfig(db, {
        reelId: "reel-1",
        autoDmMessage: "메시지",
        commentKeywords: "",
        enabled: "true"
      }),
      /enabled must be true, false, 1, or 0/
    );
  });
});

describe("application settings", () => {
  test("gets, inserts, clears, and updates a setting", async () => {
    const db = new FakeD1Database();

    assert.equal(await getAppSetting(db, "COMMENT_KEYWORDS"), null);
    assert.equal(
      await setAppSetting(db, "COMMENT_KEYWORDS", "자료,신청"),
      "자료,신청"
    );
    assert.equal(
      await setAppSetting(db, "COMMENT_KEYWORDS", ""),
      ""
    );
    assert.equal(
      await setAppSetting(db, "COMMENT_KEYWORDS", "새 키워드"),
      "새 키워드"
    );
  });

  test("uses bound parameters for setting values", async () => {
    const db = new FakeD1Database();
    const value = "값'); DROP TABLE app_settings; --";

    await setAppSetting(db, "COMMENT_KEYWORDS", value);

    assert.equal(await getAppSetting(db, "COMMENT_KEYWORDS"), value);
    assert.equal(
      db.queries.some((query) => query.includes(value)),
      false
    );
    assert.equal(
      db.queries.some((query) => query.includes("VALUES (?, ?)")),
      true
    );
  });
});

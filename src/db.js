export const DEFAULT_FOLLOW_PROMPT_MESSAGE =
  "팔로우 확인을 위해 아래 버튼을 눌러주세요.";
export const DEFAULT_FOLLOW_RETRY_MESSAGE =
  "아직 팔로우가 확인되지 않았어요. 계정을 팔로우한 뒤 아래 버튼을 다시 눌러주세요.";

export async function getReelConfig(db, reelId) {
  const normalizedReelId = requireIdentifier(reelId, "reelId");
  const row = await db
    .prepare(
      `SELECT
        reel_id,
        auto_dm_message,
        comment_keywords,
        enabled
      FROM reel_dm_config
      WHERE reel_id = ?`
    )
    .bind(normalizedReelId)
    .first();

  if (!row) {
    return null;
  }

  return {
    reelId: row.reel_id,
    autoDmMessage: row.auto_dm_message ?? "",
    commentKeywords: row.comment_keywords ?? "",
    enabled: row.enabled === 1 ? 1 : 0
  };
}

export async function getReelConfigs(db, reelIds) {
  if (!Array.isArray(reelIds)) {
    throw new TypeError("reelIds must be an array");
  }

  const normalizedIds = [
    ...new Set(
      reelIds.map((reelId) =>
        requireIdentifier(reelId, "reelId")
      )
    )
  ];

  if (normalizedIds.length === 0) {
    return new Map();
  }

  const placeholders = normalizedIds
    .map(() => "?")
    .join(", ");
  const result = await db
    .prepare(
      `SELECT
        reel_id,
        auto_dm_message,
        comment_keywords,
        enabled
      FROM reel_dm_config
      WHERE reel_id IN (${placeholders})`
    )
    .bind(...normalizedIds)
    .all();
  const configs = new Map();

  for (const row of result.results ?? []) {
    configs.set(row.reel_id, {
      reelId: row.reel_id,
      autoDmMessage: row.auto_dm_message ?? "",
      commentKeywords: row.comment_keywords ?? "",
      enabled: row.enabled === 1 ? 1 : 0
    });
  }

  return configs;
}

export async function upsertReelConfig(
  db,
  {
    reelId,
    autoDmMessage,
    commentKeywords,
    enabled
  }
) {
  const normalizedReelId = requireIdentifier(reelId, "reelId");
  const existing = await getReelConfig(db, normalizedReelId);
  const normalizedMessage = autoDmMessage === undefined
    ? existing?.autoDmMessage ?? ""
    : normalizeText(autoDmMessage, "autoDmMessage");
  const normalizedKeywords = commentKeywords === undefined
    ? existing?.commentKeywords ?? ""
    : normalizeText(commentKeywords, "commentKeywords");
  const normalizedEnabled = normalizeEnabled(enabled);
  const storedEnabled = normalizedMessage.trim()
    ? normalizedEnabled
    : 0;

  await db
    .prepare(
      `INSERT INTO reel_dm_config (
        reel_id,
        auto_dm_message,
        comment_keywords,
        enabled
      )
      VALUES (?, ?, ?, ?)
      ON CONFLICT(reel_id) DO UPDATE SET
        auto_dm_message = excluded.auto_dm_message,
        comment_keywords = excluded.comment_keywords,
        enabled = excluded.enabled`
    )
    .bind(
      normalizedReelId,
      normalizedMessage,
      normalizedKeywords,
      storedEnabled
    )
    .run();

  return getReelConfig(db, normalizedReelId);
}

export async function getAppSetting(db, key) {
  const normalizedKey = requireIdentifier(key, "key");
  const row = await db
    .prepare(
      `SELECT setting_value
      FROM app_settings
      WHERE setting_key = ?`
    )
    .bind(normalizedKey)
    .first();

  return row?.setting_value ?? null;
}

export async function setAppSetting(db, key, value) {
  const normalizedKey = requireIdentifier(key, "key");
  const normalizedValue = normalizeText(value, "value");

  await db
    .prepare(
      `INSERT INTO app_settings (
        setting_key,
        setting_value
      )
      VALUES (?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value`
    )
    .bind(normalizedKey, normalizedValue)
    .run();

  return getAppSetting(db, normalizedKey);
}

function requireIdentifier(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeText(value, name) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }

  return value;
}

function normalizeEnabled(value) {
  if (![true, false, 1, 0].includes(value)) {
    throw new TypeError("enabled must be true, false, 1, or 0");
  }

  return value === true || value === 1 ? 1 : 0;
}

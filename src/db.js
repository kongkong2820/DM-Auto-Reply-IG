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

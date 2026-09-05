CREATE TABLE reel_dm_config (
    reel_id TEXT PRIMARY KEY,
    auto_dm_message TEXT,
    comment_keywords TEXT,
    enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT
);

INSERT INTO app_settings (setting_key, setting_value)
VALUES ('COMMENT_KEYWORDS', '자료,신청');

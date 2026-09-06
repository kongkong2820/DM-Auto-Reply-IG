INSERT OR IGNORE INTO app_settings (setting_key, setting_value)
VALUES (
  'FOLLOW_PROMPT_MESSAGE',
  '팔로우 확인을 위해 아래 버튼을 눌러주세요.'
);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value)
VALUES (
  'FOLLOW_RETRY_MESSAGE',
  '아직 팔로우가 확인되지 않았어요. 계정을 팔로우한 뒤 아래 버튼을 다시 눌러주세요.'
);

ALTER TABLE reel_dm_config DROP COLUMN follow_prompt_message;
ALTER TABLE reel_dm_config DROP COLUMN follow_retry_message;

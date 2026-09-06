ALTER TABLE reel_dm_config
ADD COLUMN follow_prompt_message TEXT NOT NULL
DEFAULT '팔로우 확인을 위해 아래 버튼을 눌러주세요.';

ALTER TABLE reel_dm_config
ADD COLUMN follow_retry_message TEXT NOT NULL
DEFAULT '아직 팔로우가 확인되지 않았어요. 계정을 팔로우한 뒤 아래 버튼을 다시 눌러주세요.';

-- 応募フォームの氏名を機械的に分割して保持する。既存の name は互換用に残す。
ALTER TABLE atlasez_member_applications ADD COLUMN family_name TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN given_name TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN middle_name TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN family_name_kana TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN given_name_kana TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN form_language TEXT NOT NULL DEFAULT 'ja';

CREATE INDEX IF NOT EXISTS idx_atlasez_member_applications_names
  ON atlasez_member_applications(family_name, given_name);

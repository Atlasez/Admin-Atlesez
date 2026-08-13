-- 応募承認後の運営者登録とDiscord同期を、再実行可能な状態として記録する。
ALTER TABLE atlasez_member_applications ADD COLUMN provisioning_status TEXT NOT NULL DEFAULT 'not_started'
  CHECK(provisioning_status IN ('not_started','pending','synced','skipped','failed'));
ALTER TABLE atlasez_member_applications ADD COLUMN provisioning_error TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN provisioned_at TEXT;
ALTER TABLE atlasez_member_applications ADD COLUMN accepted_by TEXT NOT NULL DEFAULT '';

-- 応募時に正規化した所属情報を、運営者プロフィールへ欠落なく引き継ぐ。
ALTER TABLE editorial_member_profiles ADD COLUMN affiliation_type TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_member_profiles ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_member_profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';

CREATE INDEX IF NOT EXISTS idx_atlasez_member_applications_provisioning
  ON atlasez_member_applications(status, provisioning_status, updated_at DESC);

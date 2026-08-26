-- アトラスの実践型オンボーディングを、本文チュートリアルとは独立して完了判定する。
ALTER TABLE atlasez_member_onboarding_progress
  ADD COLUMN atlas_writing_practice_completed_at TEXT;

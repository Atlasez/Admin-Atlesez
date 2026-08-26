-- 記事執筆後の練習（フィードバック依頼・対応・予定確認）を順番に進めるための状態。
ALTER TABLE atlasez_member_onboarding_progress
  ADD COLUMN atlas_writing_practice_step INTEGER NOT NULL DEFAULT 0;

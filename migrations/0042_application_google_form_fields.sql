-- 既存の応募内容を保持したまま、現行Googleフォームの追加項目を保存する。
ALTER TABLE atlasez_member_applications ADD COLUMN birth_date TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN residence_prefecture TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN residence_city TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN current_organizations TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN discovery_source TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN participation_reasons TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN desired_roles TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN interview_availability TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN questions TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN strengths TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN problem_awareness TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN project_ideas TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN desired_projects TEXT NOT NULL DEFAULT '';

ALTER TABLE atlasez_member_applications ADD COLUMN affiliation_type TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN institution TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN grade TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';
ALTER TABLE atlasez_member_applications ADD COLUMN desired_subjects TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN article_ideas TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN discord_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN availability_note TEXT NOT NULL DEFAULT '';

ALTER TABLE editorial_events ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo';

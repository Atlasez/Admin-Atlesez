-- 本名とは別に、運営内で社会的に通用する呼称（チューレン等）を保存する。
ALTER TABLE atlasez_applicant_profiles ADD COLUMN nickname TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN nickname TEXT NOT NULL DEFAULT '';

-- 所属確認に使う、学校・勤務先などのメールアドレスを保存する。
ALTER TABLE atlasez_applicant_profiles ADD COLUMN affiliation_email TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN affiliation_email TEXT NOT NULL DEFAULT '';

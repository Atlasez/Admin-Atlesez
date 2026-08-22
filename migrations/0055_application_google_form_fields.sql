ALTER TABLE atlasez_member_applications ADD COLUMN referral_source TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN motivation_reasons TEXT NOT NULL DEFAULT '';
ALTER TABLE atlasez_member_applications ADD COLUMN applicant_questions TEXT NOT NULL DEFAULT '';

-- 旧フォーム列に保存済みの内容は、新しい表示名の列が空の場合だけ引き継ぐ。
UPDATE atlasez_member_applications
SET
  referral_source = CASE
    WHEN trim(referral_source) = '' THEN discovery_source
    ELSE referral_source
  END,
  motivation_reasons = CASE
    WHEN trim(motivation_reasons) = '' THEN participation_reasons
    ELSE motivation_reasons
  END,
  applicant_questions = CASE
    WHEN trim(applicant_questions) = '' THEN questions
    ELSE applicant_questions
  END;

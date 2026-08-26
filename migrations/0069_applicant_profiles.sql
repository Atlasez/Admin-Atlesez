-- 基本情報をプロジェクト別応募から分離し、複数プロジェクトへの応募で再利用する。
CREATE TABLE IF NOT EXISTS atlasez_applicant_profiles (
  email TEXT PRIMARY KEY,
  family_name TEXT NOT NULL DEFAULT '',
  given_name TEXT NOT NULL DEFAULT '',
  middle_name TEXT NOT NULL DEFAULT '',
  family_name_kana TEXT NOT NULL DEFAULT '',
  given_name_kana TEXT NOT NULL DEFAULT '',
  form_language TEXT NOT NULL DEFAULT 'ja',
  affiliation_type TEXT NOT NULL DEFAULT '',
  institution TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  birth_date TEXT NOT NULL DEFAULT '',
  residence_city TEXT NOT NULL DEFAULT '',
  current_organizations TEXT NOT NULL DEFAULT '',
  referral_source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_atlasez_applicant_profiles_updated
  ON atlasez_applicant_profiles(updated_at DESC);

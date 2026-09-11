-- 公開記事の取り込み元を記録する。
-- GitHubの公開Markdownは移行時の参考入力であり、正本であることを意味しない。
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_ref TEXT;
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_checksum TEXT;
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_checksum_algorithm TEXT NOT NULL DEFAULT 'sha256';
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_body_checksum TEXT;
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_fetched_at TEXT;
ALTER TABLE editorial_article_catalog
  ADD COLUMN source_authority TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE editorial_article_catalog
  ADD COLUMN registration_method TEXT NOT NULL DEFAULT 'legacy-backfill';
ALTER TABLE editorial_article_catalog
  ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'unverified';

CREATE INDEX IF NOT EXISTS idx_editorial_article_catalog_checksum
  ON editorial_article_catalog(source_checksum);
CREATE INDEX IF NOT EXISTS idx_editorial_article_catalog_identity_status
  ON editorial_article_catalog(identity_status);

-- 0081で先に作られた行は、本文の出所を確定できないため未検証のままにする。
-- 後続のカタログ観測でGitHub本文とSHA-256を記録する。
UPDATE editorial_article_catalog
SET source_kind = 'legacy-catalog',
    source_authority = 'unverified',
    registration_method = 'legacy-backfill',
    identity_status = 'unverified'
WHERE source_kind = 'unknown';

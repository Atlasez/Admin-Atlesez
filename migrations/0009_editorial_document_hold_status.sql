-- SQLite/D1ではCHECK制約を直接拡張できないため、子テーブルを含めて安全に再作成する。
PRAGMA foreign_keys = OFF;

CREATE TABLE editorial_documents_new (
  id TEXT PRIMARY KEY,
  source_article_id TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ja',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  concept_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in-review', 'on-hold', 'approved')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  reviewed_at TEXT
);
INSERT INTO editorial_documents_new SELECT * FROM editorial_documents;

CREATE TABLE editorial_comments_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents_new(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO editorial_comments_new SELECT * FROM editorial_comments;

CREATE TABLE editorial_document_revisions_new (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES editorial_documents_new(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  saved_by TEXT NOT NULL,
  saved_at TEXT NOT NULL
);
INSERT INTO editorial_document_revisions_new SELECT * FROM editorial_document_revisions;

DROP TABLE editorial_comments;
DROP TABLE editorial_document_revisions;
DROP TABLE editorial_documents;
ALTER TABLE editorial_documents_new RENAME TO editorial_documents;
ALTER TABLE editorial_comments_new RENAME TO editorial_comments;
ALTER TABLE editorial_document_revisions_new RENAME TO editorial_document_revisions;

CREATE INDEX idx_editorial_documents_subject_updated ON editorial_documents(subject, updated_at DESC);
CREATE INDEX idx_editorial_documents_status_updated ON editorial_documents(status, updated_at DESC);
CREATE INDEX idx_editorial_comments_document_created ON editorial_comments(document_id, created_at ASC);
CREATE INDEX idx_editorial_revisions_document_saved ON editorial_document_revisions(document_id, saved_at DESC);

PRAGMA foreign_keys = ON;

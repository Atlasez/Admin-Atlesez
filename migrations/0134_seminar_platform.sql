-- Separate seminar participation from Atlasez staff project memberships.
CREATE TABLE seminars (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id TEXT REFERENCES atlasez_accounts(id),
  title TEXT NOT NULL,
  details TEXT NOT NULL CHECK(json_valid(details)),
  proposal_status TEXT NOT NULL CHECK(proposal_status IN ('pending','approved','rejected')),
  recruitment TEXT NOT NULL CHECK(recruitment IN ('open','paused','closed')),
  phase TEXT NOT NULL CHECK(phase IN ('planned','active','paused','ended','unknown')),
  applicant_profile TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(applicant_profile)),
  operations_note TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  submission_key TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT REFERENCES atlasez_accounts(id),
  decision_note TEXT NOT NULL DEFAULT '',
  UNIQUE(host_id, submission_key)
);
CREATE INDEX idx_seminars_public ON seminars(proposal_status, recruitment, number DESC);

CREATE TABLE seminar_applications (
  id TEXT PRIMARY KEY,
  seminar_number INTEGER NOT NULL REFERENCES seminars(number),
  applicant_id TEXT NOT NULL REFERENCES atlasez_accounts(id),
  profile TEXT NOT NULL CHECK(json_valid(profile)),
  host_note TEXT NOT NULL DEFAULT '',
  operations_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT REFERENCES atlasez_accounts(id),
  decision_note TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_seminar_application_current
  ON seminar_applications(seminar_number, applicant_id) WHERE status IN ('pending','approved');
CREATE INDEX idx_seminar_applicant ON seminar_applications(applicant_id, created_at DESC);
CREATE INDEX idx_seminar_application_queue ON seminar_applications(seminar_number, status);

CREATE TABLE seminar_activities (
  id TEXT PRIMARY KEY,
  seminar_number INTEGER NOT NULL REFERENCES seminars(number),
  kind TEXT NOT NULL CHECK(kind IN ('event','task','poll','notice')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  assignee_id TEXT REFERENCES atlasez_accounts(id),
  options TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(options)),
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_seminar_activities ON seminar_activities(seminar_number, kind, due_at);
CREATE TABLE seminar_poll_answers (
  activity_id TEXT NOT NULL REFERENCES seminar_activities(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES atlasez_accounts(id),
  choice INTEGER NOT NULL,
  PRIMARY KEY(activity_id, account_id)
);

CREATE TABLE seminar_materials (
  id TEXT PRIMARY KEY,
  seminar_number INTEGER NOT NULL REFERENCES seminars(number),
  uploader_id TEXT NOT NULL REFERENCES atlasez_accounts(id),
  filename TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 1000000),
  data BLOB NOT NULL CHECK(length(data) = bytes),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_seminar_materials ON seminar_materials(seminar_number, created_at DESC);

-- Same delivery lifecycle as the existing application mailer, with independent references.
CREATE TABLE seminar_email_deliveries (
  id TEXT PRIMARY KEY,
  seminar_number INTEGER NOT NULL REFERENCES seminars(number),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','retry','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  first_attempt_at TEXT,
  claim_token TEXT,
  claimed_at TEXT,
  sent_at TEXT,
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_seminar_email_ready ON seminar_email_deliveries(status, next_attempt_at, created_at);

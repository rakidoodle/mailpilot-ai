-- Initial schema for MailPilot AI.
-- Every table is scoped to a user either directly or through a foreign key so
-- queries can always enforce ownership.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE gmail_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  -- AES-GCM ciphertext of the OAuth refresh token. Never store plaintext.
  encrypted_refresh_token TEXT,
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, email)
);

CREATE TABLE email_records (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES gmail_accounts (id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  priority TEXT NOT NULL DEFAULT 'Low',
  summary TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1,
  UNIQUE (account_id, gmail_message_id)
);

CREATE INDEX idx_email_records_account_received
  ON email_records (account_id, received_at DESC);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES email_records (id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  output_summary TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_runs_email ON agent_runs (email_id);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL REFERENCES email_records (id) ON DELETE CASCADE,
  tone TEXT NOT NULL DEFAULT 'professional',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scheduled_emails (
  id TEXT PRIMARY KEY,
  draft_id TEXT REFERENCES drafts (id) ON DELETE SET NULL,
  account_id TEXT NOT NULL REFERENCES gmail_accounts (id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  approved_at TEXT,
  sent_at TEXT,
  gmail_message_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_scheduled_emails_status_time
  ON scheduled_emails (status, scheduled_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

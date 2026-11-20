-- Gmail OAuth support: one-time state rows plus sync metadata.

ALTER TABLE gmail_accounts ADD COLUMN last_synced_at TEXT;

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_oauth_states_created ON oauth_states (created_at);

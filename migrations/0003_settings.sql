-- Per-user application settings. One row per user; the demo user is seeded.

CREATE TABLE settings (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  openrouter_model TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO settings (user_id, openrouter_model)
VALUES ('usr_demo', NULL);

-- Scheduling safeguards: idempotency key, attempt tracking.
ALTER TABLE scheduled_emails ADD COLUMN message_id TEXT;
ALTER TABLE scheduled_emails ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE scheduled_emails ADD COLUMN last_attempt_at TEXT;

CREATE INDEX idx_scheduled_emails_due
  ON scheduled_emails (status, approved_at, scheduled_at);

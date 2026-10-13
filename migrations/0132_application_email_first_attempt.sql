-- Anchor provider idempotency retries to the first attempt, not application queue creation.
ALTER TABLE atlasez_application_email_deliveries
  ADD COLUMN first_attempt_at TEXT;

-- Historical rows do not retain a reliable first-provider-request timestamp.
-- created_at is conservative: it may stop retries early, but never extends the
-- provider's idempotency window and risks a duplicate delivery.
UPDATE atlasez_application_email_deliveries
   SET first_attempt_at=created_at
 WHERE attempt_count>0;

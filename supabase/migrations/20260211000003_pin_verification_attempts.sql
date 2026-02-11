-- Rate limiting table for PIN verification attempts
-- Tracks failed/successful PIN verifications per scooter to prevent brute-force attacks
CREATE TABLE IF NOT EXISTS pin_verification_attempts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    scooter_id uuid NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    success boolean NOT NULL DEFAULT false,
    attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient rate-limit queries (scooter + recent failures)
CREATE INDEX idx_pin_attempts_scooter_time
    ON pin_verification_attempts(scooter_id, attempted_at DESC)
    WHERE success = false;

-- Auto-cleanup: delete attempts older than 24 hours to keep table small
-- (Rate limit window is 15 min, but keep 24h for audit trail)
COMMENT ON TABLE pin_verification_attempts IS 'Rate limiting for PIN verification. Entries older than 24h can be safely purged.';

-- RLS: service role only (Edge Function uses service_role key)
ALTER TABLE pin_verification_attempts ENABLE ROW LEVEL SECURITY;

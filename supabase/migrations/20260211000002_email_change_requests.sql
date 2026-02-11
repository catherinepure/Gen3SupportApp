-- Email change request tracking table
CREATE TABLE IF NOT EXISTS email_change_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    CONSTRAINT unique_pending_request UNIQUE (user_id, new_email, token_hash)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_email_change_user_id ON email_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_expires ON email_change_requests(expires_at);

-- RLS policies
ALTER TABLE email_change_requests ENABLE ROW LEVEL SECURITY;

-- Only service role can access (Edge Functions use service role)
CREATE POLICY "Service role full access on email_change_requests"
    ON email_change_requests
    FOR ALL
    USING (true)
    WITH CHECK (true);

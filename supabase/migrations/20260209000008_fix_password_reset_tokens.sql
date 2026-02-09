-- Fix password_reset_tokens table schema
-- Add missing columns if they don't exist

DO $$
BEGIN
    -- Add token column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='password_reset_tokens' AND column_name='token') THEN
        ALTER TABLE password_reset_tokens ADD COLUMN token UUID NOT NULL UNIQUE;
    END IF;

    -- Add user_id column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='password_reset_tokens' AND column_name='user_id') THEN
        ALTER TABLE password_reset_tokens ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Add expires_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='password_reset_tokens' AND column_name='expires_at') THEN
        ALTER TABLE password_reset_tokens ADD COLUMN expires_at TIMESTAMPTZ NOT NULL;
    END IF;

    -- Add used column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='password_reset_tokens' AND column_name='used') THEN
        ALTER TABLE password_reset_tokens ADD COLUMN used BOOLEAN DEFAULT false;
    END IF;

    -- Add created_at column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='password_reset_tokens' AND column_name='created_at') THEN
        ALTER TABLE password_reset_tokens ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;

    -- Add id column if missing (should already exist)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='password_reset_tokens' AND column_name='id') THEN
        ALTER TABLE password_reset_tokens ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Enable RLS if not already enabled
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists and recreate
DROP POLICY IF EXISTS "Service role can manage password reset tokens" ON password_reset_tokens;

-- Service role can do everything (Edge Functions use service role key)
CREATE POLICY "Service role can manage password reset tokens"
    ON password_reset_tokens
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE password_reset_tokens IS 'Stores password reset tokens for secure password recovery';
COMMENT ON COLUMN password_reset_tokens.token IS 'Crypto-random UUID token sent in reset email';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expiry timestamp (1 hour from creation)';
COMMENT ON COLUMN password_reset_tokens.used IS 'Whether token has been used (one-time use enforcement)';

-- Create table for PIN recovery tokens
CREATE TABLE IF NOT EXISTS public.pin_recovery_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    scooter_id UUID NOT NULL REFERENCES public.scooters(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_pin_recovery_tokens_token ON public.pin_recovery_tokens(token);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_pin_recovery_tokens_expires_at ON public.pin_recovery_tokens(expires_at);

-- Row Level Security
ALTER TABLE public.pin_recovery_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can access recovery tokens (no user access)
CREATE POLICY "Service role only" ON public.pin_recovery_tokens
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE public.pin_recovery_tokens IS 'Stores one-time tokens for PIN recovery via email';
COMMENT ON COLUMN public.pin_recovery_tokens.token IS 'Unique recovery token (UUID) sent via email';
COMMENT ON COLUMN public.pin_recovery_tokens.expires_at IS 'Token expiry time (typically 1 hour from creation)';
COMMENT ON COLUMN public.pin_recovery_tokens.used IS 'Whether token has been used to reset PIN';

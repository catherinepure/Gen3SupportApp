-- User Registration and Authentication Schema
-- Adds user accounts with email verification via SendGrid

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_token TEXT,
    verification_token_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index on verification token for email verification flow
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);

-- Create user_sessions table for managing login sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on session token for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- Create password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens ON password_reset_tokens(reset_token);

-- Add distributor_id to users table to link users to distributors
-- Users with distributor_id can only see their distributor's scooters
-- Admin users without distributor_id can see everything
ALTER TABLE users ADD COLUMN IF NOT EXISTS distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL;

-- Create audit log for user actions
CREATE TABLE IF NOT EXISTS user_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_user ON user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_created ON user_audit_log(created_at);

-- Grant permissions (adjust based on your Supabase setup)
-- These allow the anon and authenticated roles to access the tables
-- You may need to adjust based on your RLS policies

COMMENT ON TABLE users IS 'User accounts with email verification';
COMMENT ON TABLE user_sessions IS 'Active user sessions for app authentication';
COMMENT ON TABLE password_reset_tokens IS 'Tokens for password reset flow';
COMMENT ON TABLE user_audit_log IS 'Audit trail of user actions';

-- Create a function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < now();
    DELETE FROM password_reset_tokens WHERE expires_at < now() AND used = false;
    DELETE FROM users WHERE is_verified = false AND created_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up expired verification tokens
CREATE OR REPLACE FUNCTION cleanup_expired_verification_tokens()
RETURNS void AS $$
BEGIN
    UPDATE users
    SET verification_token = NULL,
        verification_token_expires = NULL
    WHERE verification_token_expires < now();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Security Fix: RLS Policy User Escalation & Password Reset Rate Limiting
-- Prevents users from escalating their own privileges via API
-- Adds rate limiting for password reset requests
-- ============================================================================

-- ============================================================================
-- FIX 1: RLS Policy - Prevent User Privilege Escalation
-- ============================================================================

-- Drop existing permissive policy that allows any field updates
DROP POLICY IF EXISTS "anon_update_users" ON users;

-- Create restrictive policy that prevents role/territory escalation
CREATE POLICY "anon_update_users" ON users
  FOR UPDATE TO anon
  USING (
    -- User must be authenticated and updating their own record
    auth.uid() = id AND is_active = true
  )
  WITH CHECK (
    -- User can only update their own record
    auth.uid() = id
    -- Prevent role escalation - roles cannot be changed
    AND roles IS NOT DISTINCT FROM (SELECT roles FROM users WHERE id = auth.uid())
    -- Prevent territory changes - distributor_id cannot be changed
    AND distributor_id IS NOT DISTINCT FROM (SELECT distributor_id FROM users WHERE id = auth.uid())
    -- Prevent workshop assignment changes
    AND workshop_id IS NOT DISTINCT FROM (SELECT workshop_id FROM users WHERE id = auth.uid())
    -- Prevent user_level changes (normal/manager/admin)
    AND user_level IS NOT DISTINCT FROM (SELECT user_level FROM users WHERE id = auth.uid())
  );

COMMENT ON POLICY "anon_update_users" ON users IS
  'Allows authenticated users to update their own profile fields only. Prevents privilege escalation by blocking changes to roles, distributor_id, workshop_id, and user_level.';

-- ============================================================================
-- FIX 2: Password Reset Rate Limiting
-- ============================================================================

-- Create table to track password reset attempts
CREATE TABLE IF NOT EXISTS password_reset_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient rate limit checks (email + time range)
CREATE INDEX idx_password_reset_attempts_email_time
  ON password_reset_attempts(email, created_at DESC);

-- Index for cleanup operations
CREATE INDEX idx_password_reset_attempts_created
  ON password_reset_attempts(created_at);

COMMENT ON TABLE password_reset_attempts IS
  'Tracks password reset request attempts for rate limiting. Max 3 requests per email per hour.';

-- Auto-cleanup function for old records (keep 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_reset_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM password_reset_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_reset_attempts() IS
  'Removes password reset attempt records older than 24 hours. Should be called periodically via cron.';

-- Grant service_role full access to attempts table
ALTER TABLE password_reset_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_reset_attempts"
  ON password_reset_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify RLS policy exists and is restrictive
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users'
  AND policyname = 'anon_update_users';

-- Verify password_reset_attempts table created
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'password_reset_attempts'
ORDER BY ordinal_position;

-- Verify indexes created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'password_reset_attempts';

-- Allow service role to update user passwords (for password reset functionality)
-- Service role is used by Edge Functions with proper authentication

-- Drop policy if exists and recreate
DROP POLICY IF EXISTS "Service role can update passwords" ON users;

-- Create policy to allow service role to update password_hash
CREATE POLICY "Service role can update passwords"
    ON users
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMENT ON POLICY "Service role can update passwords" ON users IS
'Allows Edge Functions (using service role) to update user passwords during password reset flow';

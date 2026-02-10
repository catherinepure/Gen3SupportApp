-- ============================================================================
-- Allow activity_events.user_id to be nullable
-- ============================================================================
-- The user_id column has ON DELETE SET NULL FK but the column itself has NOT NULL,
-- making it impossible to log events where user_id may not be relevant
-- (e.g., system events, admin-initiated deletions logged against admin user)

ALTER TABLE activity_events ALTER COLUMN user_id DROP NOT NULL;

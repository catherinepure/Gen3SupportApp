-- ============================================================================
-- Admin Audit Logging System
-- Tracks all administrative actions for security and compliance
-- ============================================================================

-- Create audit log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'deactivate'
  resource TEXT NOT NULL, -- 'users', 'scooters', 'distributors', 'workshops', etc.
  resource_id UUID,
  changes JSONB, -- { "field": { "old": "value1", "new": "value2" } }
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_admin_audit_log_admin
  ON admin_audit_log(admin_id, created_at DESC)
  WHERE admin_id IS NOT NULL;

CREATE INDEX idx_admin_audit_log_resource
  ON admin_audit_log(resource, resource_id, created_at DESC);

CREATE INDEX idx_admin_audit_log_action
  ON admin_audit_log(action, created_at DESC);

CREATE INDEX idx_admin_audit_log_created
  ON admin_audit_log(created_at DESC);

COMMENT ON TABLE admin_audit_log IS
  'Tracks all administrative actions (create, update, delete, deactivate) for security auditing and compliance';

COMMENT ON COLUMN admin_audit_log.changes IS
  'JSONB object containing field changes: { "field_name": { "old": "value", "new": "value" } }';

-- Enable RLS (only service_role and admins can query)
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access_audit_log"
  ON admin_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can view all audit logs (read-only)
CREATE POLICY "admins_read_audit_log"
  ON admin_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND is_active = true
        AND (
          'manufacturer_admin' = ANY(roles)
          OR user_level IN ('admin', 'manager')
        )
    )
  );

COMMENT ON POLICY "admins_read_audit_log" ON admin_audit_log IS
  'Allows admins and managers to view audit logs but not modify them';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify table structure
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'admin_audit_log'
ORDER BY ordinal_position;

-- Verify indexes
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'admin_audit_log';

-- Verify RLS policies
SELECT
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'admin_audit_log';

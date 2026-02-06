-- Upgrade Script: Add RLS and Foreign Keys to scooter_telemetry
-- Run this AFTER 002_create_telemetry_table_simple.sql has succeeded

-- 1. Add foreign key constraints (if tables exist)
DO $$
BEGIN
    -- Add scooter foreign key
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scooters') THEN
        ALTER TABLE scooter_telemetry
        DROP CONSTRAINT IF EXISTS fk_scooter_telemetry_scooter,
        ADD CONSTRAINT fk_scooter_telemetry_scooter
        FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added foreign key to scooters table';
    ELSE
        RAISE NOTICE 'Scooters table not found, skipping foreign key';
    END IF;

    -- Add distributor foreign key
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'distributors') THEN
        ALTER TABLE scooter_telemetry
        DROP CONSTRAINT IF EXISTS fk_scooter_telemetry_distributor,
        ADD CONSTRAINT fk_scooter_telemetry_distributor
        FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added foreign key to distributors table';
    ELSE
        RAISE NOTICE 'Distributors table not found, skipping foreign key';
    END IF;

    -- Add user foreign key
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        ALTER TABLE scooter_telemetry
        DROP CONSTRAINT IF EXISTS fk_scooter_telemetry_user,
        ADD CONSTRAINT fk_scooter_telemetry_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added foreign key to users table';
    ELSE
        RAISE NOTICE 'Users table not found, skipping foreign key';
    END IF;
END $$;

-- 2. Add missing index on user_id if not exists
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_user ON scooter_telemetry(user_id, scanned_at DESC);

-- 3. Enable RLS
ALTER TABLE scooter_telemetry ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist
DROP POLICY IF EXISTS "Distributors can insert telemetry" ON scooter_telemetry;
DROP POLICY IF EXISTS "Distributors can view their telemetry" ON scooter_telemetry;
DROP POLICY IF EXISTS "Users can view their scooter telemetry" ON scooter_telemetry;
DROP POLICY IF EXISTS "Service role has full access" ON scooter_telemetry;

-- 5. Create RLS policies

-- Service role (your app's backend) has full access
CREATE POLICY "Service role has full access" ON scooter_telemetry
    FOR ALL
    USING (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- Distributors can insert their own telemetry
CREATE POLICY "Distributors can insert telemetry" ON scooter_telemetry
    FOR INSERT
    WITH CHECK (
        auth.uid() = distributor_id
    );

-- Distributors can view their own telemetry
CREATE POLICY "Distributors can view their telemetry" ON scooter_telemetry
    FOR SELECT
    USING (
        auth.uid() = distributor_id
    );

-- Users can view telemetry for their registered scooters
CREATE POLICY "Users can view their scooter telemetry" ON scooter_telemetry
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_scooters
            WHERE user_scooters.scooter_id = scooter_telemetry.scooter_id
            AND user_scooters.user_id = auth.uid()
        )
    );

-- 6. Update permissions
GRANT SELECT, INSERT ON scooter_telemetry TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scooter_telemetry TO service_role;

-- 7. Update comments
COMMENT ON COLUMN scooter_telemetry.scanned_at IS 'Timestamp when the scan was performed';

-- Success message
DO $$
DECLARE
    fk_count INTEGER;
    policy_count INTEGER;
BEGIN
    SELECT count(*) INTO fk_count
    FROM information_schema.table_constraints
    WHERE table_name = 'scooter_telemetry' AND constraint_type = 'FOREIGN KEY';

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'scooter_telemetry';

    RAISE NOTICE '================================================';
    RAISE NOTICE 'Upgrade completed successfully!';
    RAISE NOTICE 'Foreign keys added: %', fk_count;
    RAISE NOTICE 'RLS policies created: %', policy_count;
    RAISE NOTICE 'RLS enabled: %', (SELECT relrowsecurity FROM pg_class WHERE relname = 'scooter_telemetry');
    RAISE NOTICE '================================================';
END $$;

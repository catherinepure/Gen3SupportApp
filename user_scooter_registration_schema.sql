-- Updated User Registration Schema with Scooter Relationships
-- Supports User and Distributor registration flows

-- Drop existing users table if starting fresh (comment out if migrating)
-- DROP TABLE IF EXISTS user_sessions CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- Create users table with profile fields
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    -- Profile information
    first_name TEXT,
    last_name TEXT,
    age_range TEXT CHECK (age_range IN ('<18', '18-24', '25-34', '35-44', '45-54', '55-64', '65+')),
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
    scooter_use_type TEXT CHECK (scooter_use_type IN ('Business', 'Pleasure', 'Both')),

    -- User level and access
    user_level TEXT NOT NULL DEFAULT 'user' CHECK (user_level IN ('user', 'distributor', 'maintenance', 'admin')),
    distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,

    -- Verification
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verification_token TEXT,
    verification_token_expires TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login TIMESTAMPTZ,

    -- Metadata
    registration_type TEXT CHECK (registration_type IN ('user', 'distributor')),
    activation_code_used TEXT  -- Store which activation code was used for distributors
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_users_user_level ON users(user_level);
CREATE INDEX IF NOT EXISTS idx_users_distributor ON users(distributor_id);

-- User sessions table (unchanged)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    device_info TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reset_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens ON password_reset_tokens(reset_token);

-- User-Scooter relationship table (many-to-many)
CREATE TABLE IF NOT EXISTS user_scooters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,

    -- Scooter details captured at registration/connection
    zyd_serial TEXT NOT NULL,

    -- Initial telemetry captured during registration
    initial_odometer_km DECIMAL(10,2),
    initial_battery_soc INTEGER,  -- State of charge percentage
    initial_charge_cycles INTEGER,
    initial_discharge_cycles INTEGER,
    controller_hw_version TEXT,
    controller_sw_version TEXT,
    bms_hw_version TEXT,
    bms_sw_version TEXT,

    -- Relationship metadata
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_connected_at TIMESTAMPTZ,
    is_primary BOOLEAN NOT NULL DEFAULT false,  -- User's primary scooter
    nickname TEXT,  -- User can name their scooter

    UNIQUE(user_id, scooter_id)
);

CREATE INDEX IF NOT EXISTS idx_user_scooters_user ON user_scooters(user_id);
CREATE INDEX IF NOT EXISTS idx_user_scooters_scooter ON user_scooters(scooter_id);
CREATE INDEX IF NOT EXISTS idx_user_scooters_serial ON user_scooters(zyd_serial);

-- Scooter telemetry snapshots (captured each connection)
CREATE TABLE IF NOT EXISTS scooter_telemetry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_scooter_id UUID NOT NULL REFERENCES user_scooters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,

    -- Telemetry data
    odometer_km DECIMAL(10,2),
    battery_soc INTEGER,
    charge_cycles INTEGER,
    discharge_cycles INTEGER,
    battery_voltage DECIMAL(5,2),
    battery_current DECIMAL(6,2),
    motor_temp INTEGER,
    controller_temp INTEGER,
    speed_kmh DECIMAL(5,2),

    -- Fault codes if any
    fault_codes JSONB,

    -- Config data from 0x01 packet
    config_data JSONB,

    -- Timestamp
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    connection_session_id UUID  -- Link to user_sessions if needed
);

CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_user_scooter ON scooter_telemetry(user_scooter_id);
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_captured ON scooter_telemetry(captured_at);
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_user ON scooter_telemetry(user_id);

-- Audit log for user actions
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
CREATE INDEX IF NOT EXISTS idx_user_audit_log_action ON user_audit_log(action);

-- Function to check if user can access a scooter
CREATE OR REPLACE FUNCTION user_can_access_scooter(
    p_user_id UUID,
    p_scooter_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_level TEXT;
    v_distributor_id UUID;
    v_scooter_distributor_id UUID;
    v_has_direct_access BOOLEAN;
BEGIN
    -- Get user level and distributor
    SELECT user_level, distributor_id INTO v_user_level, v_distributor_id
    FROM users WHERE id = p_user_id;

    -- Admins can access everything
    IF v_user_level = 'admin' THEN
        RETURN TRUE;
    END IF;

    -- Check if user has direct access (registered this scooter)
    SELECT EXISTS(
        SELECT 1 FROM user_scooters
        WHERE user_id = p_user_id AND scooter_id = p_scooter_id
    ) INTO v_has_direct_access;

    IF v_has_direct_access THEN
        RETURN TRUE;
    END IF;

    -- Distributors can access scooters in their distributor account
    IF v_user_level IN ('distributor', 'maintenance') AND v_distributor_id IS NOT NULL THEN
        SELECT distributor_id INTO v_scooter_distributor_id
        FROM scooters WHERE id = p_scooter_id;

        IF v_scooter_distributor_id = v_distributor_id THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's scooters
CREATE OR REPLACE FUNCTION get_user_scooters(p_user_id UUID)
RETURNS TABLE (
    user_scooter_id UUID,
    scooter_id UUID,
    zyd_serial TEXT,
    nickname TEXT,
    is_primary BOOLEAN,
    registered_at TIMESTAMPTZ,
    last_connected_at TIMESTAMPTZ,
    initial_odometer_km DECIMAL,
    controller_hw_version TEXT,
    controller_sw_version TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        us.id,
        us.scooter_id,
        us.zyd_serial,
        us.nickname,
        us.is_primary,
        us.registered_at,
        us.last_connected_at,
        us.initial_odometer_km,
        us.controller_hw_version,
        us.controller_sw_version
    FROM user_scooters us
    WHERE us.user_id = p_user_id
    ORDER BY us.is_primary DESC, us.registered_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to add scooter to user account
CREATE OR REPLACE FUNCTION add_scooter_to_user(
    p_user_id UUID,
    p_scooter_id UUID,
    p_zyd_serial TEXT,
    p_telemetry JSONB
)
RETURNS UUID AS $$
DECLARE
    v_user_scooter_id UUID;
    v_is_first_scooter BOOLEAN;
BEGIN
    -- Check if this is user's first scooter (make it primary)
    SELECT NOT EXISTS(
        SELECT 1 FROM user_scooters WHERE user_id = p_user_id
    ) INTO v_is_first_scooter;

    -- Insert or update user_scooter
    INSERT INTO user_scooters (
        user_id,
        scooter_id,
        zyd_serial,
        initial_odometer_km,
        initial_battery_soc,
        initial_charge_cycles,
        initial_discharge_cycles,
        controller_hw_version,
        controller_sw_version,
        bms_hw_version,
        bms_sw_version,
        is_primary,
        last_connected_at
    ) VALUES (
        p_user_id,
        p_scooter_id,
        p_zyd_serial,
        (p_telemetry->>'odometer_km')::DECIMAL,
        (p_telemetry->>'battery_soc')::INTEGER,
        (p_telemetry->>'charge_cycles')::INTEGER,
        (p_telemetry->>'discharge_cycles')::INTEGER,
        p_telemetry->>'controller_hw_version',
        p_telemetry->>'controller_sw_version',
        p_telemetry->>'bms_hw_version',
        p_telemetry->>'bms_sw_version',
        v_is_first_scooter,
        now()
    )
    ON CONFLICT (user_id, scooter_id)
    DO UPDATE SET last_connected_at = now()
    RETURNING id INTO v_user_scooter_id;

    RETURN v_user_scooter_id;
END;
$$ LANGUAGE plpgsql;

-- Cleanup functions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < now();
    DELETE FROM password_reset_tokens WHERE expires_at < now() AND used = false;
    DELETE FROM users WHERE is_verified = false AND created_at < now() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_verification_tokens()
RETURNS void AS $$
BEGIN
    UPDATE users
    SET verification_token = NULL,
        verification_token_expires = NULL
    WHERE verification_token_expires < now();
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON TABLE users IS 'User accounts with profile information and user levels';
COMMENT ON TABLE user_scooters IS 'Many-to-many relationship between users and their scooters';
COMMENT ON TABLE scooter_telemetry IS 'Historical telemetry data captured during connections';
COMMENT ON TABLE user_audit_log IS 'Audit trail of user actions';
COMMENT ON COLUMN users.user_level IS 'Access level: user (default), distributor, maintenance, admin';
COMMENT ON COLUMN users.registration_type IS 'How they registered: user (with scooter) or distributor (with activation code)';
COMMENT ON COLUMN user_scooters.is_primary IS 'Users primary/main scooter';
COMMENT ON FUNCTION user_can_access_scooter IS 'Check if user has permission to access a scooter';
COMMENT ON FUNCTION get_user_scooters IS 'Get all scooters registered to a user';
COMMENT ON FUNCTION add_scooter_to_user IS 'Register a scooter to a user account';

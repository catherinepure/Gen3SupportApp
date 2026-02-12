-- Ride telemetry tables for recording sessions and time-series samples
-- ride_sessions: one row per recording session
-- ride_telemetry: one row per sample (A0+A1 combined) at ~1Hz

-- ================================================================
-- ride_sessions
-- ================================================================
CREATE TABLE IF NOT EXISTS ride_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    trigger_type TEXT NOT NULL DEFAULT 'manual',  -- 'manual' or 'diagnostic'
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    sample_count INTEGER DEFAULT 0,
    max_duration_seconds INTEGER DEFAULT 300,
    status TEXT NOT NULL DEFAULT 'recording',  -- 'recording', 'completed', 'uploaded'
    diagnostic_config JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ride_sessions_scooter_id ON ride_sessions(scooter_id);
CREATE INDEX idx_ride_sessions_user_id ON ride_sessions(user_id);
CREATE INDEX idx_ride_sessions_pending ON ride_sessions(status) WHERE status != 'uploaded';
CREATE INDEX idx_ride_sessions_trigger_type ON ride_sessions(trigger_type);

ALTER TABLE ride_sessions ENABLE ROW LEVEL SECURITY;

-- Service role only (Edge Function access)
CREATE POLICY "Service role full access on ride_sessions"
    ON ride_sessions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ================================================================
-- ride_telemetry (samples)
-- ================================================================
CREATE TABLE IF NOT EXISTS ride_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ride_session_id UUID NOT NULL REFERENCES ride_sessions(id) ON DELETE CASCADE,
    sample_index INTEGER NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,

    -- A0 fields
    speed_kmh INTEGER,
    motor_temp INTEGER,
    controller_temp INTEGER,
    fault_code INTEGER DEFAULT 0,
    gear_level INTEGER,
    trip_distance_km INTEGER,
    total_distance_km INTEGER,
    remaining_range_km INTEGER,
    motor_rpm INTEGER,
    current_limit NUMERIC(6,2),
    control_flags INTEGER,

    -- A1 fields
    battery_voltage NUMERIC(5,1),
    battery_current NUMERIC(6,2),
    battery_percent INTEGER,
    battery_temp INTEGER
);

CREATE INDEX idx_ride_telemetry_session ON ride_telemetry(ride_session_id);
CREATE INDEX idx_ride_telemetry_session_index ON ride_telemetry(ride_session_id, sample_index);

ALTER TABLE ride_telemetry ENABLE ROW LEVEL SECURITY;

-- Service role only (Edge Function access)
CREATE POLICY "Service role full access on ride_telemetry"
    ON ride_telemetry FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ================================================================
-- Add fault_capture_disabled to scooters table
-- ================================================================
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS fault_capture_disabled BOOLEAN DEFAULT false;

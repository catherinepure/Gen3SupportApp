-- Add CS diagnostic flag columns to scooters table
-- Allows CS team to request enhanced diagnostic data from specific scooters

ALTER TABLE scooters
ADD COLUMN IF NOT EXISTS diagnostic_requested BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS diagnostic_config JSONB,
ADD COLUMN IF NOT EXISTS diagnostic_requested_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS diagnostic_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS diagnostic_declined_at TIMESTAMPTZ;

-- diagnostic_config schema:
-- {
--   "data_types": ["telemetry", "ble_logs", "battery_history"],
--   "frequency_seconds": 10,
--   "max_duration_minutes": 30,
--   "reason": "Investigating battery drain reported by customer"
-- }

COMMENT ON COLUMN scooters.diagnostic_requested IS
  'True when CS team has requested enhanced diagnostics from this scooter';

COMMENT ON COLUMN scooters.diagnostic_config IS
  'JSON config for diagnostic collection: data_types, frequency_seconds, max_duration_minutes, reason';

COMMENT ON COLUMN scooters.diagnostic_requested_by IS
  'User (admin/manager) who requested the diagnostic';

COMMENT ON COLUMN scooters.diagnostic_requested_at IS
  'When the diagnostic was requested';

COMMENT ON COLUMN scooters.diagnostic_declined_at IS
  'When the user declined the diagnostic request (NULL if accepted or not yet responded)';

-- Partial index for quickly finding scooters with active diagnostic requests
CREATE INDEX IF NOT EXISTS idx_scooters_diagnostic_requested
  ON scooters (diagnostic_requested)
  WHERE diagnostic_requested = true;

-- Add record_type to scooter_telemetry for start/stop/riding telemetry pairs
-- Nullable — existing records stay NULL (backward compatible)

ALTER TABLE scooter_telemetry
ADD COLUMN IF NOT EXISTS record_type TEXT;

-- Values: 'start', 'stop', 'riding' (future)
-- NULL = legacy record (pre-start/stop feature)

COMMENT ON COLUMN scooter_telemetry.record_type IS
  'Telemetry record type: start (connection), stop (disconnect), riding (in-ride diagnostic). NULL = legacy record.';

-- Index for filtering by record type
CREATE INDEX IF NOT EXISTS idx_telemetry_record_type
  ON scooter_telemetry (record_type)
  WHERE record_type IS NOT NULL;

-- Composite index for pairing start/stop records per scooter
CREATE INDEX IF NOT EXISTS idx_telemetry_scooter_record_type_time
  ON scooter_telemetry (scooter_id, record_type, scanned_at DESC)
  WHERE record_type IS NOT NULL;

-- ============================================================================
-- Allow nullable FK columns that have ON DELETE SET NULL
-- ============================================================================
-- These columns have SET NULL FK behavior but NOT NULL column constraints,
-- which contradicts the intended cascade behavior.

ALTER TABLE scooter_telemetry ALTER COLUMN scooter_id DROP NOT NULL;
ALTER TABLE firmware_uploads ALTER COLUMN scooter_id DROP NOT NULL;

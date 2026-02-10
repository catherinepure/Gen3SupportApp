-- Add registration location columns to users table
-- Captures where the user was when they registered (GPS/network/IP-based)

ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_latitude DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_longitude DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_accuracy REAL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_location_method TEXT; -- 'gps', 'network', 'last_known', 'ip'
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_country TEXT; -- ISO country code e.g. 'US'
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_region TEXT; -- state/province e.g. 'California'
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_city TEXT;

COMMENT ON COLUMN users.registration_latitude IS 'GPS latitude at registration time';
COMMENT ON COLUMN users.registration_longitude IS 'GPS longitude at registration time';
COMMENT ON COLUMN users.registration_accuracy IS 'Location accuracy in meters';
COMMENT ON COLUMN users.registration_location_method IS 'How location was obtained: gps, network, last_known, ip';
COMMENT ON COLUMN users.registration_country IS 'ISO country code from reverse geocoding';
COMMENT ON COLUMN users.registration_region IS 'State/province from reverse geocoding';
COMMENT ON COLUMN users.registration_city IS 'City from reverse geocoding';

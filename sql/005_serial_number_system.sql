-- ============================================================================
-- Serial Number System Migration
-- Adds structured product serial numbers, reference tables, and
-- "at first registration" snapshot data to scooters.
--
-- Serial format: S{block}{model}{variant}{colour}-{serial}
-- Example: S008C1-000001
--   S = prefix
--   0 = block code (manufacturing region/batch)
--   08 = model code (Advance)
--   C = battery variant (12Ah)
--   1 = colour (Black)
--   000001 = incremental serial (unique per SKU combo)
-- ============================================================================


-- ============================================================================
-- REFERENCE TABLES
-- ============================================================================

-- Scooter Models (8 types)
CREATE TABLE IF NOT EXISTS scooter_models (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(2) NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Battery Variants
CREATE TABLE IF NOT EXISTS battery_variants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          CHAR(1) NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    capacity_ah   DECIMAL(5,2) NOT NULL,
    voltage       DECIMAL(5,1) DEFAULT 48.0,
    description   TEXT,
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Colour Options
CREATE TABLE IF NOT EXISTS colour_options (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          CHAR(1) NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    hex_colour    VARCHAR(7),
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Block/Zone Codes (manufacturing batches / regions)
CREATE TABLE IF NOT EXISTS block_codes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          CHAR(1) NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    regions       TEXT[],
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Serial Number Sequences (auto-increment per SKU combo)
CREATE TABLE IF NOT EXISTS serial_sequences (
    sku_prefix    VARCHAR(10) PRIMARY KEY,
    next_serial   INTEGER NOT NULL DEFAULT 1
);


-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_scooter_models_code ON scooter_models(code);
CREATE INDEX IF NOT EXISTS idx_battery_variants_code ON battery_variants(code);
CREATE INDEX IF NOT EXISTS idx_colour_options_code ON colour_options(code);
CREATE INDEX IF NOT EXISTS idx_block_codes_code ON block_codes(code);


-- ============================================================================
-- TRIGGERS (auto-update timestamps)
-- ============================================================================

CREATE TRIGGER update_scooter_models_timestamp
    BEFORE UPDATE ON scooter_models
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_battery_variants_timestamp
    BEFORE UPDATE ON battery_variants
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_colour_options_timestamp
    BEFORE UPDATE ON colour_options
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_block_codes_timestamp
    BEFORE UPDATE ON block_codes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE scooter_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE battery_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE colour_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE serial_sequences ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users, write for admins
CREATE POLICY scooter_models_read ON scooter_models FOR SELECT USING (true);
CREATE POLICY scooter_models_write ON scooter_models FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

CREATE POLICY battery_variants_read ON battery_variants FOR SELECT USING (true);
CREATE POLICY battery_variants_write ON battery_variants FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

CREATE POLICY colour_options_read ON colour_options FOR SELECT USING (true);
CREATE POLICY colour_options_write ON colour_options FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

CREATE POLICY block_codes_read ON block_codes FOR SELECT USING (true);
CREATE POLICY block_codes_write ON block_codes FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

CREATE POLICY serial_sequences_all ON serial_sequences FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');


-- ============================================================================
-- ALTER SCOOTERS TABLE
-- ============================================================================

-- Product serial number
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS serial_number VARCHAR(20) UNIQUE;

-- Foreign keys to reference tables
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES scooter_models(id);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS battery_variant_id UUID REFERENCES battery_variants(id);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS colour_id UUID REFERENCES colour_options(id);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS block_code_id UUID REFERENCES block_codes(id);

-- MAC address
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS mac_address VARCHAR(17);

-- "At first registration" snapshot (immutable after initial set)
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS original_serial_number VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS original_zyd_serial TEXT;
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS original_mac_address VARCHAR(17);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS first_registration_address JSONB;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_scooters_serial_number ON scooters(serial_number);
CREATE INDEX IF NOT EXISTS idx_scooters_model_id ON scooters(model_id);
CREATE INDEX IF NOT EXISTS idx_scooters_mac_address ON scooters(mac_address);


-- ============================================================================
-- AUTO-GENERATE SERIAL NUMBER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION next_serial_number(
    p_block CHAR(1),
    p_model VARCHAR(2),
    p_variant CHAR(1),
    p_colour CHAR(1)
) RETURNS TEXT AS $$
DECLARE
    v_prefix VARCHAR(10);
    v_seq INTEGER;
BEGIN
    v_prefix := 'S' || p_block || p_model || p_variant || p_colour;

    INSERT INTO serial_sequences (sku_prefix, next_serial)
    VALUES (v_prefix, 2)
    ON CONFLICT (sku_prefix)
    DO UPDATE SET next_serial = serial_sequences.next_serial + 1
    RETURNING next_serial - 1 INTO v_seq;

    RETURN v_prefix || '-' || lpad(v_seq::text, 6, '0');
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- SEED REFERENCE DATA
-- ============================================================================

-- Scooter Models
INSERT INTO scooter_models (code, name, description) VALUES
    ('06', 'City',    'Compact urban commuter'),
    ('08', 'Advance', 'Premium all-rounder'),
    ('10', 'Flex',    'Lightweight folding design'),
    ('12', 'Tour',    'Long-range touring model'),
    ('14', 'Cargo',   'Utility and cargo variant'),
    ('16', 'Sport',   'High-performance sport model'),
    ('18', 'Max',     'Maximum power and range'),
    ('20', 'Ultra',   'Flagship premium model')
ON CONFLICT (code) DO NOTHING;

-- Battery Variants
INSERT INTO battery_variants (code, name, capacity_ah, voltage, description) VALUES
    ('A', '7.2Ah',  7.20, 48.0, 'Standard range battery'),
    ('B', '9.6Ah',  9.60, 48.0, 'Extended range battery'),
    ('C', '12Ah',  12.00, 48.0, 'Maximum range battery')
ON CONFLICT (code) DO NOTHING;

-- Colour Options
INSERT INTO colour_options (code, name, hex_colour) VALUES
    ('1', 'Black',  '#000000'),
    ('2', 'Silver', '#C0C0C0'),
    ('3', 'Blue',   '#1E40AF')
ON CONFLICT (code) DO NOTHING;

-- Block/Zone Codes
INSERT INTO block_codes (code, name, regions) VALUES
    ('0', 'UK/Ireland',      ARRAY['GB', 'IE']::TEXT[]),
    ('1', 'North America',   ARRAY['US', 'CA']::TEXT[]),
    ('2', 'DACH',            ARRAY['DE', 'AT', 'CH']::TEXT[]),
    ('3', 'Nordic',          ARRAY['SE', 'NO', 'DK', 'FI']::TEXT[]),
    ('4', 'Southern Europe', ARRAY['ES', 'IT', 'PT', 'FR']::TEXT[])
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE scooter_models IS 'Reference table for scooter model types (2-digit codes)';
COMMENT ON TABLE battery_variants IS 'Reference table for battery variants (single-letter codes)';
COMMENT ON TABLE colour_options IS 'Reference table for scooter colours (single-digit codes)';
COMMENT ON TABLE block_codes IS 'Reference table for manufacturing block/zone codes (single char)';
COMMENT ON TABLE serial_sequences IS 'Auto-incrementing serial numbers per SKU prefix';
COMMENT ON FUNCTION next_serial_number IS 'Generates next serial number for a given block+model+variant+colour combination';
COMMENT ON COLUMN scooters.serial_number IS 'Product serial number in format S{block}{model}{variant}{colour}-{serial}';
COMMENT ON COLUMN scooters.original_serial_number IS 'Serial number at time of first registration (immutable)';
COMMENT ON COLUMN scooters.original_zyd_serial IS 'ZYD/MCU serial at time of first registration (immutable)';
COMMENT ON COLUMN scooters.original_mac_address IS 'MAC address at time of first registration (immutable)';
COMMENT ON COLUMN scooters.first_registration_address IS 'Address at time of first registration as JSON (immutable)';


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- New tables: scooter_models, battery_variants, colour_options, block_codes,
--             serial_sequences
-- Altered:    scooters (11 new columns)
-- Functions:  next_serial_number(block, model, variant, colour)
-- Reference data: 8 models, 3 battery variants, 3 colours, 5 block codes
-- ============================================================================

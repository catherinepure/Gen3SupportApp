-- =============================================================================
-- Gen3FirmwareUpdater Supabase Schema
-- Run this in the Supabase SQL Editor
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Table: distributors
-- Stores distributor accounts with activation codes
-- ---------------------------------------------------------------------------
CREATE TABLE distributors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    activation_code TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_distributors_activation_code ON distributors(activation_code);

-- ---------------------------------------------------------------------------
-- Table: scooters
-- Stores scooter serial numbers assigned to distributors
-- ---------------------------------------------------------------------------
CREATE TABLE scooters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zyd_serial TEXT NOT NULL UNIQUE,
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    model TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scooters_distributor_id ON scooters(distributor_id);
CREATE INDEX idx_scooters_zyd_serial ON scooters(zyd_serial);

-- ---------------------------------------------------------------------------
-- Table: firmware_versions
-- Stores firmware metadata, points to file in Storage bucket
-- ---------------------------------------------------------------------------
CREATE TABLE firmware_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_label TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,
    target_hw_version TEXT NOT NULL,
    min_sw_version TEXT,
    release_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_firmware_versions_hw ON firmware_versions(target_hw_version);

-- ---------------------------------------------------------------------------
-- Table: firmware_uploads
-- Logs every firmware upload attempt
-- ---------------------------------------------------------------------------
CREATE TABLE firmware_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scooter_id UUID NOT NULL REFERENCES scooters(id),
    firmware_version_id UUID NOT NULL REFERENCES firmware_versions(id),
    distributor_id UUID NOT NULL REFERENCES distributors(id),
    old_hw_version TEXT,
    old_sw_version TEXT,
    new_version TEXT,
    status TEXT NOT NULL DEFAULT 'started',
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_firmware_uploads_scooter ON firmware_uploads(scooter_id);
CREATE INDEX idx_firmware_uploads_distributor ON firmware_uploads(distributor_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE scooters ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE firmware_uploads ENABLE ROW LEVEL SECURITY;

-- Distributors: read-only for anon
CREATE POLICY "anon_read_distributors"
    ON distributors FOR SELECT TO anon USING (true);

-- Scooters: read-only for anon
CREATE POLICY "anon_read_scooters"
    ON scooters FOR SELECT TO anon USING (true);

-- Firmware versions: read active only for anon
CREATE POLICY "anon_read_firmware_versions"
    ON firmware_versions FOR SELECT TO anon USING (is_active = true);

-- Firmware uploads: read, insert, update for anon (app logs results)
CREATE POLICY "anon_read_firmware_uploads"
    ON firmware_uploads FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_firmware_uploads"
    ON firmware_uploads FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_firmware_uploads"
    ON firmware_uploads FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Storage bucket (run separately in Storage settings or via SQL)
-- Create a bucket called 'firmware-binaries' with public access
-- ---------------------------------------------------------------------------
-- INSERT INTO storage.buckets (id, name, public) VALUES ('firmware-binaries', 'firmware-binaries', true);

-- Storage policy: anon can read firmware files
-- CREATE POLICY "anon_read_firmware_files"
--     ON storage.objects FOR SELECT TO anon
--     USING (bucket_id = 'firmware-binaries');

-- ---------------------------------------------------------------------------
-- Test data (remove or modify for production)
-- ---------------------------------------------------------------------------
INSERT INTO distributors (name, activation_code, is_active)
VALUES ('Test Distributor', 'TEST-2024-ALPHA', true);

-- Get the distributor ID for foreign keys
-- (In practice, copy the UUID from the insert above)
INSERT INTO scooters (zyd_serial, distributor_id, model, notes)
SELECT 'ZYD1234567890', id, 'Gen3 Pro', 'Test scooter'
FROM distributors WHERE activation_code = 'TEST-2024-ALPHA';

INSERT INTO firmware_versions (version_label, file_path, file_size_bytes, target_hw_version, min_sw_version, release_notes, is_active)
VALUES ('V2.3', 'controller_v2_3.bin', 0, 'V1.0', NULL, 'Test firmware version', true);

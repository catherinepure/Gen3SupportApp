package com.pure.gen3firmwareupdater;

/**
 * Firmware version metadata from Supabase.
 */
public class FirmwareVersion {
    public String id;
    public String version_label;
    public String file_path;
    public long file_size_bytes;
    public String target_hw_version;
    public String min_sw_version;
    public String release_notes;
    public boolean is_active;
}

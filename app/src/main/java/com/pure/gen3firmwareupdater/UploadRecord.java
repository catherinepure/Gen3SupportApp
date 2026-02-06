package com.pure.gen3firmwareupdater;

/**
 * Firmware upload log record for Supabase.
 */
public class UploadRecord {
    public String id;
    public String scooter_id;
    public String firmware_version_id;
    public String distributor_id;
    public String old_hw_version;
    public String old_sw_version;
    public String new_version;
    public String status;
    public String error_message;
    public String started_at;
    public String completed_at;
}

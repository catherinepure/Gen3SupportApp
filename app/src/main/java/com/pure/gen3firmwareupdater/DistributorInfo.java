package com.pure.gen3firmwareupdater;

import java.util.List;

/**
 * Distributor data from Supabase.
 */
public class DistributorInfo {
    public String id;
    public String name;
    public String activation_code;
    public boolean is_active;

    /** Populated after a second API call to fetch scooter serials. */
    public List<String> scooterSerials;
}

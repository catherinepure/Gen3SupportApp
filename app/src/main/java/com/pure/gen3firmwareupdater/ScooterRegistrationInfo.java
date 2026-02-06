package com.pure.gen3firmwareupdater;

/**
 * Information about a scooter's registration to a user/customer
 */
public class ScooterRegistrationInfo {
    public String userId;
    public String ownerName;          // "First Last"
    public String ownerEmail;
    public String registeredDate;     // ISO timestamp
    public String lastConnectedDate;  // ISO timestamp
    public boolean isPrimary;         // Is this the user's primary scooter?
    public String nickname;           // User-given nickname

    @Override
    public String toString() {
        return "ScooterRegistrationInfo{" +
                "owner='" + ownerName + '\'' +
                ", email='" + ownerEmail + '\'' +
                ", registered=" + registeredDate +
                ", isPrimary=" + isPrimary +
                '}';
    }
}

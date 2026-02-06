package com.pure.gen3firmwareupdater;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Represents a user record from the users table.
 * Used for distributor user management (search, view, edit).
 */
public class UserInfo {
    // Identity
    public String id;
    public String email;
    public String firstName;
    public String lastName;

    // Role and association
    public String userLevel;      // 'user', 'distributor', 'admin'
    public String distributorId;

    // Profile
    public String ageRange;
    public String gender;
    public String scooterUseType;

    // Status
    public boolean isActive;
    public boolean isVerified;
    public String createdAt;

    // Populated from related queries
    public int scooterCount;

    /**
     * Get display name: "First Last" or email if no name set.
     */
    public String getDisplayName() {
        StringBuilder name = new StringBuilder();
        if (firstName != null && !firstName.isEmpty()) {
            name.append(firstName);
        }
        if (lastName != null && !lastName.isEmpty()) {
            if (name.length() > 0) name.append(" ");
            name.append(lastName);
        }
        return name.length() > 0 ? name.toString() : email;
    }

    /**
     * Get human-readable status.
     */
    public String getStatusDisplay() {
        if (!isActive) return "Inactive";
        if (!isVerified) return "Unverified";
        return "Active";
    }

    /**
     * Get human-readable user level.
     */
    public String getUserLevelDisplay() {
        if (userLevel == null) return "User";
        switch (userLevel) {
            case "admin":
                return "Admin";
            case "distributor":
                return "Distributor";
            case "user":
            default:
                return "User";
        }
    }

    /**
     * Get formatted creation date.
     */
    public String getFormattedDate() {
        if (createdAt == null) return "Unknown";
        try {
            SimpleDateFormat inputFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            SimpleDateFormat outputFormat = new SimpleDateFormat("MMM dd, yyyy", Locale.US);
            Date date = inputFormat.parse(createdAt);
            return outputFormat.format(date);
        } catch (Exception e) {
            return createdAt;
        }
    }

    @Override
    public String toString() {
        return "UserInfo{" +
                "id='" + id + '\'' +
                ", email='" + email + '\'' +
                ", userLevel='" + userLevel + '\'' +
                ", isActive=" + isActive +
                ", isVerified=" + isVerified +
                '}';
    }
}

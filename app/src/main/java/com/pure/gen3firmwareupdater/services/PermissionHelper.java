package com.pure.gen3firmwareupdater.services;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Centralized BLE permission checking.
 * Consolidates the permission logic duplicated across FirmwareUpdaterActivity
 * and ScanScooterActivity.
 *
 * Note: This is Android-specific by nature. For React Native/Flutter ports,
 * native platform permission APIs replace this class entirely.
 */
public class PermissionHelper {

    /**
     * Get the list of BLE permissions that still need to be requested.
     *
     * @param context Android context for checking permission status
     * @return list of permission strings that need requesting, empty if all granted
     */
    public static List<String> getNeededBLEPermissions(Context context) {
        List<String> needed = new ArrayList<>();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN);
            }
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }

        return needed;
    }

    /**
     * Check if all BLE permissions are already granted.
     *
     * @param context Android context
     * @return true if all required BLE permissions are granted
     */
    public static boolean hasAllBLEPermissions(Context context) {
        return getNeededBLEPermissions(context).isEmpty();
    }
}

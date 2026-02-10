package com.pure.gen3firmwareupdater.services;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.List;
import java.util.Locale;

/**
 * Captures device location during registration.
 * Uses FusedLocationProvider for GPS/network fix, then reverse geocodes.
 */
public class LocationCaptureManager {
    private static final String TAG = "LocationCapture";
    private static final long TIMEOUT_MS = 10_000;

    private final Context context;
    private final FusedLocationProviderClient fusedClient;
    private LocationCallback activeCallback;

    public LocationCaptureManager(Context context) {
        this.context = context.getApplicationContext();
        this.fusedClient = LocationServices.getFusedLocationProviderClient(this.context);
    }

    public static class LocationData {
        public double latitude;
        public double longitude;
        public float accuracy;
        public String method;  // "gps", "network", "last_known"
        public String country; // ISO country code e.g. "US"
        public String region;  // state/province e.g. "California"
        public String city;

        @Override
        public String toString() {
            return String.format(Locale.US,
                    "LocationData{lat=%.4f, lng=%.4f, acc=%.0fm, method=%s, country=%s, region=%s, city=%s}",
                    latitude, longitude, accuracy, method, country, region, city);
        }
    }

    public interface LocationCallback2 {
        void onLocationCaptured(LocationData data);
        void onLocationFailed(String reason);
    }

    public boolean hasPermission() {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    public void captureLocation(@NonNull LocationCallback2 callback) {
        if (!hasPermission()) {
            callback.onLocationFailed("Location permission not granted");
            return;
        }

        // Try last known location first
        try {
            fusedClient.getLastLocation().addOnSuccessListener(location -> {
                if (location != null && isRecentEnough(location)) {
                    Log.d(TAG, "Using last known location");
                    processLocation(location, "last_known", callback);
                } else {
                    requestFreshLocation(callback);
                }
            }).addOnFailureListener(e -> {
                Log.w(TAG, "getLastLocation failed, requesting fresh", e);
                requestFreshLocation(callback);
            });
        } catch (SecurityException e) {
            callback.onLocationFailed("Location permission denied");
        }
    }

    private boolean isRecentEnough(Location location) {
        long age = System.currentTimeMillis() - location.getTime();
        return age < 5 * 60 * 1000; // 5 minutes
    }

    private void requestFreshLocation(@NonNull LocationCallback2 callback) {
        try {
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 1000)
                    .setMaxUpdates(1)
                    .setDurationMillis(TIMEOUT_MS)
                    .build();

            activeCallback = new LocationCallback() {
                @Override
                public void onLocationResult(@NonNull LocationResult result) {
                    fusedClient.removeLocationUpdates(this);
                    activeCallback = null;
                    Location loc = result.getLastLocation();
                    if (loc != null) {
                        String method = loc.getProvider() != null ? loc.getProvider() : "fused";
                        processLocation(loc, method, callback);
                    } else {
                        callback.onLocationFailed("No location in result");
                    }
                }
            };

            fusedClient.requestLocationUpdates(request, activeCallback, Looper.getMainLooper());

            // Timeout fallback
            new android.os.Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (activeCallback != null) {
                    fusedClient.removeLocationUpdates(activeCallback);
                    activeCallback = null;
                    callback.onLocationFailed("Location request timed out");
                }
            }, TIMEOUT_MS + 1000);

        } catch (SecurityException e) {
            callback.onLocationFailed("Location permission denied");
        }
    }

    private void processLocation(Location location, String method, LocationCallback2 callback) {
        LocationData data = new LocationData();
        data.latitude = location.getLatitude();
        data.longitude = location.getLongitude();
        data.accuracy = location.getAccuracy();
        data.method = method;

        // Reverse geocode in background
        new Thread(() -> {
            reverseGeocode(data);
            Log.d(TAG, "Location captured: " + data);
            new android.os.Handler(Looper.getMainLooper()).post(() -> callback.onLocationCaptured(data));
        }).start();
    }

    private void reverseGeocode(LocationData data) {
        if (!Geocoder.isPresent()) return;

        try {
            Geocoder geocoder = new Geocoder(context, Locale.getDefault());
            List<Address> addresses = geocoder.getFromLocation(data.latitude, data.longitude, 1);
            if (addresses != null && !addresses.isEmpty()) {
                Address addr = addresses.get(0);
                data.country = addr.getCountryCode();
                data.region = addr.getAdminArea();
                data.city = addr.getLocality();
            }
        } catch (Exception e) {
            Log.w(TAG, "Reverse geocoding failed", e);
        }
    }

    public void stop() {
        if (activeCallback != null) {
            fusedClient.removeLocationUpdates(activeCallback);
            activeCallback = null;
        }
    }
}

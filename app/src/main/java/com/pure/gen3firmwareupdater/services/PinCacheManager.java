package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.concurrent.TimeUnit;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Secure PIN caching using Android Keystore.
 * Stores encrypted PINs with 7-day expiry for weekly re-verification.
 *
 * Security features:
 * - Encryption at rest using Android Keystore (hardware-backed when available)
 * - Per-scooter PIN storage with timestamps
 * - Automatic expiry after 7 days
 * - No plaintext PIN storage
 */
public class PinCacheManager {

    private static final String TAG = "PinCacheManager";
    private static final String PREFS_NAME = "PinCachePrefs";
    private static final String KEYSTORE_ALIAS = "ScooterPinCacheKey";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";

    private static final long CACHE_DURATION_MS = TimeUnit.DAYS.toMillis(7); // 7 days

    private final SharedPreferences prefs;
    private final Context context;

    public PinCacheManager(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        ensureKeystoreKey();
    }

    /**
     * Cache a PIN for a specific scooter with encryption.
     * @param scooterId The scooter's database UUID
     * @param pin The 6-digit PIN in plaintext
     */
    public void cachePin(String scooterId, String pin) {
        try {
            String encryptedPin = encrypt(pin);
            long timestamp = System.currentTimeMillis();

            prefs.edit()
                    .putString(getCacheKey(scooterId), encryptedPin)
                    .putLong(getTimestampKey(scooterId), timestamp)
                    .apply();

            Log.d(TAG, "PIN cached for scooter: " + scooterId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to cache PIN", e);
        }
    }

    /**
     * Retrieve a cached PIN if it exists and hasn't expired.
     * @param scooterId The scooter's database UUID
     * @return The plaintext PIN, or null if not cached or expired
     */
    public String getCachedPin(String scooterId) {
        try {
            String encryptedPin = prefs.getString(getCacheKey(scooterId), null);
            long timestamp = prefs.getLong(getTimestampKey(scooterId), 0);

            if (encryptedPin == null || timestamp == 0) {
                return null; // Not cached
            }

            // Check expiry
            long age = System.currentTimeMillis() - timestamp;
            if (age > CACHE_DURATION_MS) {
                Log.d(TAG, "Cached PIN expired for scooter: " + scooterId);
                clearCachedPin(scooterId);
                return null;
            }

            String plainPin = decrypt(encryptedPin);
            Log.d(TAG, "Retrieved cached PIN for scooter: " + scooterId + " (age: " + TimeUnit.MILLISECONDS.toDays(age) + " days)");
            return plainPin;
        } catch (Exception e) {
            Log.e(TAG, "Failed to retrieve cached PIN", e);
            return null;
        }
    }

    /**
     * Check if a cached PIN exists and is still valid.
     */
    public boolean hasCachedPin(String scooterId) {
        return getCachedPin(scooterId) != null;
    }

    /**
     * Check if the cached PIN is nearing expiry (within 1 day).
     * This can be used to prompt for re-verification.
     */
    public boolean shouldReVerify(String scooterId) {
        long timestamp = prefs.getLong(getTimestampKey(scooterId), 0);
        if (timestamp == 0) return false;

        long age = System.currentTimeMillis() - timestamp;
        long daysRemaining = TimeUnit.MILLISECONDS.toDays(CACHE_DURATION_MS - age);
        return daysRemaining <= 1;
    }

    /**
     * Get the number of days remaining before cache expiry.
     */
    public long getDaysRemaining(String scooterId) {
        long timestamp = prefs.getLong(getTimestampKey(scooterId), 0);
        if (timestamp == 0) return 0;

        long age = System.currentTimeMillis() - timestamp;
        long remaining = CACHE_DURATION_MS - age;
        return remaining > 0 ? TimeUnit.MILLISECONDS.toDays(remaining) : 0;
    }

    /**
     * Clear the cached PIN for a specific scooter.
     */
    public void clearCachedPin(String scooterId) {
        prefs.edit()
                .remove(getCacheKey(scooterId))
                .remove(getTimestampKey(scooterId))
                .apply();
        Log.d(TAG, "Cleared cached PIN for scooter: " + scooterId);
    }

    /**
     * Clear all cached PINs (e.g., on logout).
     */
    public void clearAllCachedPins() {
        prefs.edit().clear().apply();
        Log.d(TAG, "Cleared all cached PINs");
    }

    // ==================================================================================
    // ENCRYPTION / DECRYPTION
    // ==================================================================================

    /**
     * Ensure the Keystore key exists, create if not.
     */
    private void ensureKeystoreKey() {
        try {
            KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
            keyStore.load(null);

            if (!keyStore.containsAlias(KEYSTORE_ALIAS)) {
                KeyGenerator keyGenerator = KeyGenerator.getInstance(
                        KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);

                KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                        KEYSTORE_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setRandomizedEncryptionRequired(true)
                        .build();

                keyGenerator.init(spec);
                keyGenerator.generateKey();
                Log.d(TAG, "Keystore key generated");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to ensure Keystore key", e);
        }
    }

    /**
     * Encrypt a PIN using Android Keystore.
     * Returns base64-encoded ciphertext with IV prepended.
     */
    private String encrypt(String plaintext) throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);

        SecretKey key = (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);

        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

        // Prepend IV to ciphertext for storage
        byte[] combined = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, combined, 0, iv.length);
        System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);

        return Base64.encodeToString(combined, Base64.DEFAULT);
    }

    /**
     * Decrypt a PIN using Android Keystore.
     * Expects base64-encoded ciphertext with IV prepended.
     */
    private String decrypt(String encryptedData) throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);

        SecretKey key = (SecretKey) keyStore.getKey(KEYSTORE_ALIAS, null);

        byte[] combined = Base64.decode(encryptedData, Base64.DEFAULT);

        // Validate minimum length: 12-byte IV + at least 1 byte ciphertext + 16-byte GCM tag
        if (combined.length < 29) {
            Log.w(TAG, "Corrupted cached PIN data (too short), clearing");
            throw new GeneralSecurityException("Encrypted data too short to contain IV + ciphertext");
        }

        // Extract IV (first 12 bytes for GCM)
        byte[] iv = new byte[12];
        byte[] ciphertext = new byte[combined.length - 12];
        System.arraycopy(combined, 0, iv, 0, 12);
        System.arraycopy(combined, 12, ciphertext, 0, ciphertext.length);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));

        byte[] plaintext = cipher.doFinal(ciphertext);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    // ==================================================================================
    // PREFERENCE KEYS
    // ==================================================================================

    private String getCacheKey(String scooterId) {
        return "pin_cache_" + scooterId;
    }

    private String getTimestampKey(String scooterId) {
        return "pin_timestamp_" + scooterId;
    }
}

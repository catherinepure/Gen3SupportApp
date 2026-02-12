package com.pure.gen3firmwareupdater.data;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

/**
 * Room database for ride telemetry recording.
 * Singleton with double-checked locking.
 */
@Database(entities = {RideSessionEntity.class, RideSampleEntity.class}, version = 1)
public abstract class AppDatabase extends RoomDatabase {

    private static volatile AppDatabase instance;

    public abstract RideDao rideDao();

    public static AppDatabase getInstance(Context context) {
        if (instance == null) {
            synchronized (AppDatabase.class) {
                if (instance == null) {
                    instance = Room.databaseBuilder(
                            context.getApplicationContext(),
                            AppDatabase.class,
                            "gen3_ride_telemetry.db"
                    ).build();
                }
            }
        }
        return instance;
    }
}

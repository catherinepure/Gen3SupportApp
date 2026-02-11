# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Gson
-keep class com.pure.gen3firmwareupdater.DistributorInfo { *; }
-keep class com.pure.gen3firmwareupdater.FirmwareVersion { *; }
-keep class com.pure.gen3firmwareupdater.UploadRecord { *; }
-keep class com.pure.gen3firmwareupdater.VersionInfo { *; }

# Intercom SDK
-keep class io.intercom.android.** { *; }
-keep class com.intercom.** { *; }

# Firebase Messaging
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Retrofit (transitive dependency of Intercom)
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

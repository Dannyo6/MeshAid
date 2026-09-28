package dev.meshaid.app.util

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Utility helper to detect and request exemption from aggressive OEM battery savers
 * and Android Doze mode to prevent suspension of background BLE relay services.
 */
object BatteryOptimizationHelper {
    private const val TAG = "BatteryOptimizationHelper"

    /**
     * Checks if the application is currently exempted from Android Doze mode and
     * system battery optimizations via [PowerManager.isIgnoringBatteryOptimizations].
     *
     * @param context Application or Activity context.
     * @return true if battery optimizations are ignored (exempted), or false if restricted.
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: true
            } catch (e: Exception) {
                Log.w(TAG, "Error checking battery optimization status: ${e.message}")
                true
            }
        } else {
            true
        }
    }

    /**
     * Launches the system dialog requesting the user to exempt the application from
     * battery optimizations for persistent store-carry-forward relaying.
     *
     * Uses [Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS] with `package:<packageName>` URI.
     * Falls back to [Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS] if the direct prompt fails.
     *
     * @param activity Foreground activity to host the system dialog.
     */
    @SuppressLint("BatteryLife")
    fun requestIgnoreBatteryOptimizations(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivity(intent)
                Log.i(TAG, "Launched ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dialog")
            } catch (e: Exception) {
                Log.w(TAG, "Direct exemption prompt failed: ${e.message}. Attempting settings fallback...")
                try {
                    val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    activity.startActivity(fallbackIntent)
                } catch (fe: Exception) {
                    Log.e(TAG, "Failed to launch battery optimization settings: ${fe.message}", fe)
                }
            }
        }
    }
}

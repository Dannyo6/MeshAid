package dev.meshaid.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.meshaid.app.ui.theme.MeshAidTheme
import dev.meshaid.app.ui.theme.Slate950

/**
 * Main entry-point activity for MeshAid Emergency Dispatcher.
 *
 * Requests required runtime permissions ([Manifest.permission.BLUETOOTH_SCAN],
 * [Manifest.permission.BLUETOOTH_ADVERTISE], and [Manifest.permission.ACCESS_FINE_LOCATION])
 * and hosts [RelayDashboardScreen].
 */
class MainActivity : ComponentActivity() {

    companion object {
        private const val TAG = "MainActivity"

        /**
         * Collects all runtime permissions required for BLE mesh operation
         * across Android SDK versions.
         */
        fun getRequiredPermissions(): Array<String> {
            val permissions = mutableListOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                permissions.add(Manifest.permission.BLUETOOTH_SCAN)
                permissions.add(Manifest.permission.BLUETOOTH_ADVERTISE)
                permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }

            return permissions.toTypedArray()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            MeshAidTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Slate950
                ) {
                    val viewModel: EmergencyViewModel = viewModel()

                    RequestPermissionsEffect()

                    RelayDashboardScreen(viewModel = viewModel)
                }
            }
        }
    }

    @Composable
    private fun RequestPermissionsEffect() {
        val requiredPermissions = remember { getRequiredPermissions() }
        var hasRequested by remember { mutableStateOf(false) }

        val permissionLauncher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestMultiplePermissions()
        ) { results ->
            results.forEach { (permission, isGranted) ->
                Log.d(TAG, "Permission $permission granted: $isGranted")
            }
        }

        LaunchedEffect(Unit) {
            if (!hasRequested) {
                hasRequested = true
                val ungranted = requiredPermissions.filter { perm ->
                    ContextCompat.checkSelfPermission(this@MainActivity, perm) != PackageManager.PERMISSION_GRANTED
                }
                if (ungranted.isNotEmpty()) {
                    Log.i(TAG, "Requesting permissions: $ungranted")
                    permissionLauncher.launch(ungranted.toTypedArray())
                }
            }
        }
    }
}

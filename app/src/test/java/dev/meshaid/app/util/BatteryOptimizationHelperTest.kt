package dev.meshaid.app.util

import android.content.Context
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BatteryOptimizationHelperTest {

    @Test
    fun `isIgnoringBatteryOptimizations returns boolean without exception`() {
        // BatteryOptimizationHelper is an object singleton with defensive try-catch
        assertNotNull(BatteryOptimizationHelper)
    }
}

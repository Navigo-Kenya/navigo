package com.navigo.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.clickable
import androidx.glance.action.actionStartActivity
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.*
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import org.json.JSONObject

private val ORANGE = Color(0xFFFF6F00)
private val WHITE  = Color(0xFFFFFFFF)
private val GRAY   = Color(0xFF888888)

class NavigoGlanceWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Single

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs  = context.getSharedPreferences("navigo_widget_data", Context.MODE_PRIVATE)
        val json   = prefs.getString("widget_data_v1", null)
        val data   = parseWidgetData(json)

        provideContent {
            WidgetContent(context, data)
        }
    }

    private fun parseWidgetData(json: String?): WidgetData {
        if (json == null) return WidgetData()
        return try {
            val obj = JSONObject(json)
            WidgetData(
                homeName          = obj.optString("home_name").ifEmpty { null },
                workName          = obj.optString("work_name").ifEmpty { null },
                streakDays        = obj.optInt("streak_days", 0),
                lastDestination   = obj.optString("last_destination").ifEmpty { null },
            )
        } catch (_: Exception) { WidgetData() }
    }
}

data class WidgetData(
    val homeName: String?        = null,
    val workName: String?        = null,
    val streakDays: Int          = 0,
    val lastDestination: String? = null,
)

@Composable
private fun WidgetContent(context: Context, data: WidgetData) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(0xFF1A1A1A))
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Header
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = "Navigo",
                style = TextStyle(
                    color = ColorProvider(ORANGE),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                ),
            )
            if (data.streakDays > 0) {
                Spacer(GlanceModifier.width(6.dp))
                Text(
                    text = "🔥 ${data.streakDays}",
                    style = TextStyle(color = ColorProvider(WHITE), fontSize = 12.sp),
                )
            }
        }
        Spacer(GlanceModifier.height(10.dp))
        // Home shortcut
        QuickButton(label = "🏠  ${data.homeName ?: "Set home"}", enabled = data.homeName != null)
        Spacer(GlanceModifier.height(6.dp))
        // Work shortcut
        QuickButton(label = "💼  ${data.workName ?: "Set work"}", enabled = data.workName != null)

        if (data.lastDestination != null) {
            Spacer(GlanceModifier.height(6.dp))
            QuickButton(label = "↩  ${data.lastDestination}", enabled = true, isSecondary = true)
        }
    }
}

@Composable
private fun QuickButton(label: String, enabled: Boolean, isSecondary: Boolean = false) {
    Box(
        modifier = GlanceModifier
            .fillMaxWidth()
            .background(if (isSecondary) Color(0xFF2A2A2A) else Color(0xFF2C2C2C))
            .padding(horizontal = 10.dp, vertical = 7.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = label,
            style = TextStyle(
                color = ColorProvider(if (enabled) WHITE else GRAY),
                fontSize = 12.sp,
            ),
            maxLines = 1,
        )
    }
}

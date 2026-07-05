package com.navigo.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NavigoWidgetDataModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("NavigoWidgetData")

        Function("writeWidgetData") { json: String ->
            val ctx = appContext.reactContext ?: return@Function
            val prefs = ctx.getSharedPreferences("navigo_widget_data", Context.MODE_PRIVATE)
            prefs.edit().putString("widget_data_v1", json).apply()
            // Trigger widget refresh
            val manager = AppWidgetManager.getInstance(ctx)
            val ids = manager.getAppWidgetIds(
                ComponentName(ctx, NavigoWidgetReceiver::class.java)
            )
            if (ids.isNotEmpty()) {
                NavigoWidgetReceiver().onUpdate(ctx, manager, ids)
            }
        }
    }
}

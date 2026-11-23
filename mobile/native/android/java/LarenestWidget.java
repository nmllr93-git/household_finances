package com.larenest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// "Budget & bills" home-screen widget (kept under its original name so widgets already placed keep working).
public class LarenestWidget extends AppWidgetProvider {
    static final String PREFS = WidgetStore.PREFS;
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, WidgetRender.build(c, R.layout.widget_budget, 0, id)); }
    static void refreshAll(Context c) { WidgetRender.renderAll(c); }
}

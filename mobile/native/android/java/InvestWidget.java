package com.larenest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// Investments: value, today's change and a 30-day line
public class InvestWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, WidgetRender.build(c, R.layout.widget_invest, 1, id)); }
}

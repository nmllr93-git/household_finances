package com.larenest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// Market movers (full width): today's biggest gainers and losers
public class MoversWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, WidgetRender.build(c, R.layout.widget_movers, 4)); }
}

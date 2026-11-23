package com.larenest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// Markets: followed sectors and watchlist
public class MarketsWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, WidgetRender.build(c, R.layout.widget_markets, 2, id)); }
}

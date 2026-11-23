package com.larenest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

// Bills & subscriptions: what's due in the next 30 days
public class BillsWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id : ids) m.updateAppWidget(id, WidgetRender.build(c, R.layout.widget_bills, 3)); }
}

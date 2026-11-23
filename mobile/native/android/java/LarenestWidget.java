package com.larenest.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

// Home-screen widget: this month's budget at a glance and the next bill. It shows the last summary the app saved
// (the app refreshes it whenever a dashboard loads); tapping it opens the app.
public class LarenestWidget extends AppWidgetProvider {
    static final String PREFS = "larenest_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, LarenestWidget.class));
        for (int id : ids) draw(ctx, mgr, id);
    }

    private static String s(JSONObject j, String k) { return j == null ? "" : j.optString(k, ""); }

    static void draw(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.larenest_widget);
        JSONObject j = null;
        try { j = new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}")); } catch (Exception e) { j = null; }
        boolean has = j != null && j.has("big");
        v.setTextViewText(R.id.w_title, has ? s(j, "title") : "Larenest");
        v.setTextViewText(R.id.w_big, has ? s(j, "big") : "Open Larenest");
        v.setTextViewText(R.id.w_line1, has ? s(j, "line1") : "Your budget shows here after you open a dashboard.");
        String l2 = has ? s(j, "line2") : "";
        v.setTextViewText(R.id.w_line2, l2);
        v.setViewVisibility(R.id.w_line2, l2.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_updated, has ? s(j, "updated") : "");
        int pct = has ? j.optInt("pct", -1) : -1;
        if (pct >= 0) { v.setViewVisibility(R.id.w_bar, View.VISIBLE); v.setProgressBar(R.id.w_bar, 100, Math.min(100, pct), false); }
        else v.setViewVisibility(R.id.w_bar, View.GONE);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.w_root, pi);
        mgr.updateAppWidget(id, v);
    }
}

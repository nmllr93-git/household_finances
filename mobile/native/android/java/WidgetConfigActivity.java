package com.larenest.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONArray;

// Shown when a widget is placed (and from "Settings" on a placed widget): which dashboard should it show?
public class WidgetConfigActivity extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        final int id = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        final Intent ok = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        setResult(RESULT_CANCELED, ok);
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }
        final JSONArray books = WidgetStore.books(this);
        if (books.length() < 2) { done(id, ok); return; } // one dashboard: nothing to choose
        final String[] labels = new String[books.length() + 1], ids = new String[books.length() + 1];
        labels[0] = "The dashboard open in the app"; ids[0] = "";
        for (int i = 0; i < books.length(); i++) { labels[i + 1] = books.optJSONObject(i).optString("name", "Dashboard"); ids[i + 1] = books.optJSONObject(i).optString("id"); }
        String cur = WidgetStore.bookFor(this, id); int sel = 0; for (int i = 0; i < ids.length; i++) if (ids[i].equals(cur)) sel = i;
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert).setTitle("Show which dashboard?")
            .setSingleChoiceItems(labels, sel, (d, w) -> { WidgetStore.setBookFor(this, id, ids[w]); d.dismiss(); done(id, ok); })
            .setOnCancelListener((d) -> done(id, ok)).show();
    }
    private void done(int id, Intent ok) { WidgetRender.renderAll(getApplicationContext()); setResult(RESULT_OK, ok); finish(); }
}

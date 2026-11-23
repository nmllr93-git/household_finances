package com.larenest.app;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// The dashboard (phone-only or connected to a computer) hands the home-screen widget a ready-to-show summary.
// It's kept in this app's private storage on the phone; nothing is sent anywhere.
@CapacitorPlugin(name = "LarenestWidget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String data = call.getString("data", "{}");
        Context ctx = getContext();
        ctx.getSharedPreferences(LarenestWidget.PREFS, Context.MODE_PRIVATE).edit().putString("data", data).apply();
        LarenestWidget.refreshAll(ctx);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(LarenestWidget.PREFS, Context.MODE_PRIVATE).edit().remove("data").apply();
        LarenestWidget.refreshAll(ctx);
        call.resolve();
    }
}

package com.larenest.app;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Phone-only pages (which have Capacitor) hand the home-screen widgets their summary here.
// It's kept in this app's private storage on the phone; nothing is sent anywhere.
@CapacitorPlugin(name = "LarenestWidget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        WidgetStore.save(ctx, call.getString("data", "{}"));
        WidgetRender.renderAll(ctx);
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        WidgetStore.schedule(getContext(), call.getInt("minutes", 0));
        call.resolve();
    }

    // the start screen (the app's own page, never a server's) pins your computer's certificate
    @PluginMethod
    public void trustCert(PluginCall call) {
        Pins.add(getContext(), call.getString("host", ""), call.getString("fp", ""));
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context ctx = getContext();
        WidgetStore.prefs(ctx).edit().remove("payload").apply();
        WidgetRender.renderAll(ctx);
        call.resolve();
    }
}

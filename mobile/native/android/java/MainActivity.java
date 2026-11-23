package com.larenest.app;

import android.content.Context;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetPlugin.class); // home-screen widget (phone-only pages, which have Capacitor)
        super.onCreate(savedInstanceState);
        // Pages served by your computer don't get Capacitor's bridge, so give every page in this app a tiny,
        // widget-only connection: it can save the widgets' summary and set their refresh schedule, nothing else.
        final Context ctx = getApplicationContext();
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void update(String data) {
                if (data == null || data.length() > 60000) return;
                WidgetStore.save(ctx, data);
                WidgetRender.renderAll(ctx);
            }
            @JavascriptInterface
            public void schedule(int minutes) { WidgetStore.schedule(ctx, Math.max(0, Math.min(1440, minutes))); }
        }, "LarenestWidgetNative");
    }
}

package com.larenest.app;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetPlugin.class); // home-screen widget (phone-only pages, which have Capacitor)
        registerPlugin(BiometricPlugin.class); // fingerprint / face unlock for the app lock
        registerPlugin(OcrPlugin.class); // receipt scanning
        super.onCreate(savedInstanceState);
        // Pages served by your computer don't get Capacitor's bridge, so give every page in this app a tiny,
        // widget-only connection: it can save the widgets' summary and set their refresh schedule, nothing else.
        final Context ctx = getApplicationContext();
        getBridge().getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void update(String data) {
                if (data == null || data.length() > 400000) return;
                WidgetStore.save(ctx, data);
                WidgetRender.renderAll(ctx);
                Alerts.check(ctx);
            }
            // receipt scanning for pages served by your computer: the photo's text, read on this phone (runs on the bridge's own thread)
            @JavascriptInterface
            public String ocr(String b64) { try { return OcrPlugin.readText(b64); } catch (Exception e) { return ""; } }
            @JavascriptInterface
            public void schedule(int minutes) { WidgetStore.schedule(ctx, Math.max(0, Math.min(1440, minutes))); }
            // phone alerts need the notification permission (Android 13+); returns true when allowed
            @JavascriptInterface
            public boolean alertsAllowed(boolean ask) {
                if (android.os.Build.VERSION.SDK_INT < 33) return true;
                boolean ok = checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (!ok && ask) runOnUiThread(() -> requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, 77));
                return ok;
            }
        }, "LarenestWidgetNative");
        // HTTPS to your own computer: accept its certificate only if it's the one pinned for it (see Pins)
        getBridge().setWebViewClient(new com.getcapacitor.BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedSslError(android.webkit.WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
                if (error != null && Pins.trusted(ctx, error.getCertificate())) handler.proceed(); else handler.cancel();
            }
        });
        goFrom(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) { super.onNewIntent(intent); goFrom(intent); }

    // opened from a widget or an alert: show that section (and dashboard) once the page is ready
    private void goFrom(Intent i) {
        if (i == null) return; String go = i.getStringExtra("go"), book = i.getStringExtra("book");
        if (go == null || go.isEmpty() || !go.matches("[a-z-]{1,30}")) return;
        if (book == null || !book.matches("[A-Za-z0-9_-]{0,64}")) book = "";
        i.removeExtra("go");
        final String js = "window.__fdGo={s:'" + go + "',b:'" + book + "'};window.FDGo&&window.FDGo('" + go + "','" + book + "');";
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().evaluateJavascript(js, null), 400);
    }
}

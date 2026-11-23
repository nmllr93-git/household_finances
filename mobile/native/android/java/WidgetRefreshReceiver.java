package com.larenest.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

// The widgets' ⟳ button and the background schedule land here: fetch a fresh summary from the computer, then redraw.
// After a restart, the background schedule is set up again.
public class WidgetRefreshReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final Context c = ctx.getApplicationContext();
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) { WidgetStore.reschedule(c); return; }
        if (!WidgetStore.ACTION_REFRESH.equals(a)) return;
        if (!WidgetStore.canFetch(c)) { // phone-only mode (or never opened): open the app, which refreshes the widgets
            try { WidgetStore.openApp(c, 901).send(); } catch (Exception e) { /* nothing to open */ }
            return;
        }
        WidgetStore.setStatus(c, "Updating…");
        WidgetRender.renderAll(c);
        final PendingResult pr = goAsync();
        new Thread(() -> {
            try { WidgetStore.fetch(c); WidgetRender.renderAll(c); }
            finally { pr.finish(); }
        }).start();
    }
}

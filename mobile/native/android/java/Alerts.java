package com.larenest.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

// Phone alerts, worked out on the phone from the widgets' summary (nothing is sent anywhere):
//  - a bill is due tomorrow (or today)
//  - a dashboard's budget passes 90% (and again at 100%) for the month
// Each alert is shown once. Checked whenever the summary changes: when the app is open, on ⟳, and on the background refresh.
final class Alerts {
    private Alerts() {}
    static final String CH = "larenest_alerts";

    static void check(Context c) {
        try {
            JSONObject cf = WidgetStore.cfg(c), al = cf.optJSONObject("alerts"); if (al == null) return;
            boolean bills = al.optBoolean("bills", false), budget = al.optBoolean("budget", false); if (!bills && !budget) return;
            boolean hide = WidgetStore.hide(c);
            JSONObject p = WidgetStore.payload(c), all = p.optJSONObject("books");
            if (all == null) { all = new JSONObject(); JSONObject d = p.optJSONObject("data"); if (d != null) all.put(cf.optString("book", "x"), d); }
            SharedPreferences sp = WidgetStore.prefs(c); Set<String> done = new HashSet<>(sp.getStringSet("alerted", new HashSet<>()));
            int n0 = done.size(); long today = dayNumber(new java.util.Date().getTime(), false);
            for (Iterator<String> it = all.keys(); it.hasNext(); ) {
                String book = it.next(); JSONObject d = all.optJSONObject(book); if (d == null) continue; String name = d.optString("name", "Larenest");
                if (bills) { JSONArray b = d.optJSONArray("bills"); if (b != null) for (int i = 0; i < b.length(); i++) {
                    JSONObject x = b.optJSONObject(i); String ymd = x.optString("date"); long days = dayOf(ymd) - today; if (days < 0 || days > 1) continue;
                    String key = "b|" + book + "|" + x.optString("name") + "|" + ymd; if (done.contains(key)) continue; done.add(key);
                    notify(c, key.hashCode(), x.optString("name") + " is due " + (days == 0 ? "today" : "tomorrow"),
                        (hide ? "" : "About " + WidgetStore.money(x.optDouble("amount")) + " · ") + name); } }
                if (budget) { JSONObject bu = d.optJSONObject("budget"); if (bu != null && bu.optBoolean("has")) {
                    int used = bu.optInt("usedPct", 0), lvl = used >= 100 ? 100 : used >= 90 ? 90 : 0; if (lvl == 0) continue;
                    String key = "u|" + book + "|" + bu.optString("month") + "|" + lvl; if (done.contains(key)) continue; done.add(key);
                    if (lvl == 100) done.add("u|" + book + "|" + bu.optString("month") + "|90");
                    notify(c, key.hashCode(), lvl == 100 ? name + ": over budget for " + bu.optString("month") : name + ": " + used + "% of the budget used",
                        lvl == 100 ? (hide ? "Spending has passed this month's budget." : WidgetStore.money0(bu.optDouble("spent") - bu.optDouble("available")) + " over so far.")
                            : (bu.isNull("monthPct") ? "" : bu.optInt("monthPct") + "% of the month has passed.")); } }
            }
            if (done.size() != n0) { if (done.size() > 300) done.clear(); sp.edit().putStringSet("alerted", done).apply(); }
        } catch (Exception e) { /* alerts are best-effort */ }
    }

    private static long dayNumber(long ms, boolean utc) { Calendar k = Calendar.getInstance(utc ? TimeZone.getTimeZone("UTC") : TimeZone.getDefault()); k.setTimeInMillis(ms);
        Calendar u = Calendar.getInstance(TimeZone.getTimeZone("UTC")); u.clear(); u.set(k.get(Calendar.YEAR), k.get(Calendar.MONTH), k.get(Calendar.DAY_OF_MONTH)); return u.getTimeInMillis() / 86400000L; }
    private static long dayOf(String ymd) { try { SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US); f.setTimeZone(TimeZone.getTimeZone("UTC")); return f.parse(ymd).getTime() / 86400000L; } catch (Exception e) { return -99999; } }

    private static void notify(Context c, int id, String title, String body) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 33 && c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) { nm.createNotificationChannel(new NotificationChannel(CH, "Bills and budget alerts", NotificationManager.IMPORTANCE_DEFAULT)); b = new Notification.Builder(c, CH); }
        else b = new Notification.Builder(c);
        b.setSmallIcon(c.getApplicationInfo().icon).setContentTitle(title).setAutoCancel(true).setContentIntent(WidgetStore.openApp(c, 3000 + (id & 0xfff), title.contains("due") ? "subscriptions" : "budget", ""));
        if (body != null && !body.isEmpty()) b.setContentText(body);
        nm.notify(id, b.build());
    }
}

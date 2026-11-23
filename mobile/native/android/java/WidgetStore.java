package com.larenest.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

// Everything the home-screen widgets share: the saved summary, where to refresh it from, formatting, refresh and schedule.
// The summary comes from the dashboard (GET /api/books/<id>/widgets) and stays in this app's private storage on the phone.
final class WidgetStore {
    static final String PREFS = "larenest_widget";
    static final String ACTION_REFRESH = "com.larenest.app.WIDGET_REFRESH";
    // colors (Larenest charcoal theme)
    static final int FG = 0xFFECEBE8, MUTED = 0xFFA8A29B, ACCENT = 0xFFE08A66, GOLD = 0xFFE3A848, UP = 0xFF4CC38A, DOWN = 0xFFF07070;

    private WidgetStore() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // {cfg:{base, book, query, hide, local}, data:{…}}
    static JSONObject payload(Context c) {
        try { return new JSONObject(prefs(c).getString("payload", "{}")); } catch (Exception e) { return new JSONObject(); }
    }
    static JSONObject data(Context c) { JSONObject p = payload(c); return p.optJSONObject("data"); }
    static JSONObject cfg(Context c) { JSONObject p = payload(c); JSONObject x = p.optJSONObject("cfg"); return x == null ? new JSONObject() : x; }
    static boolean hide(Context c) { return cfg(c).optBoolean("hide", false); }
    static String status(Context c) { return prefs(c).getString("status", ""); }
    static void setStatus(Context c, String s) { prefs(c).edit().putString("status", s).apply(); }

    static void save(Context c, String json) {
        if (json == null || json.length() > 60000) return;
        prefs(c).edit().putString("payload", json).putString("status", "").putLong("at", System.currentTimeMillis()).apply();
    }

    static String updated(Context c) {
        String st = status(c);
        if (!st.isEmpty()) return st;
        long at = prefs(c).getLong("at", 0);
        if (at == 0) return "";
        return "Updated " + new SimpleDateFormat("h:mm a", Locale.US).format(new Date(at)).replace("AM", "am").replace("PM", "pm");
    }

    // ---- formatting ----
    static String money(double v) {
        NumberFormat f = NumberFormat.getCurrencyInstance(Locale.US);
        f.setMaximumFractionDigits(Math.abs(v) >= 1000 ? 0 : 2); f.setMinimumFractionDigits(Math.abs(v) >= 1000 ? 0 : 2);
        return f.format(v);
    }
    static String money0(double v) { NumberFormat f = NumberFormat.getCurrencyInstance(Locale.US); f.setMaximumFractionDigits(0); f.setMinimumFractionDigits(0); return f.format(v); }
    static String pct(double v) { return (v > 0 ? "+" : v < 0 ? "−" : "") + String.format(Locale.US, "%.1f%%", Math.abs(v)); }
    static int tone(double v) { return v > 0 ? UP : v < 0 ? DOWN : MUTED; }
    static String arrow(double v) { return v > 0 ? "▲" : v < 0 ? "▼" : "•"; }
    static String when(String ymd, int days) {
        if (days == 0) return "Today";
        if (days == 1) return "Tomorrow";
        try {
            SimpleDateFormat in = new SimpleDateFormat("yyyy-MM-dd", Locale.US); in.setTimeZone(TimeZone.getTimeZone("UTC"));
            SimpleDateFormat out = new SimpleDateFormat(days < 7 ? "EEE" : "MMM d", Locale.US); out.setTimeZone(TimeZone.getTimeZone("UTC"));
            return out.format(in.parse(ymd));
        } catch (Exception e) { return ymd; }
    }

    // ---- refresh from the computer (runs off the main thread) ----
    static boolean canFetch(Context c) { JSONObject cf = cfg(c); return !cf.optBoolean("local", false) && !cf.optString("base", "").isEmpty() && !cf.optString("book", "").isEmpty(); }

    static boolean fetch(Context c) {
        JSONObject cf = cfg(c);
        if (!canFetch(c)) return false;
        HttpURLConnection h = null;
        try {
            String base = cf.optString("base"), url = base + "/api/books/" + java.net.URLEncoder.encode(cf.optString("book"), "UTF-8") + "/widgets?" + cf.optString("query", "");
            h = (HttpURLConnection) new URL(url).openConnection();
            h.setConnectTimeout(8000); h.setReadTimeout(30000); h.setRequestProperty("Accept", "application/json");
            String ck = CookieManager.getInstance().getCookie(base); // the dashboard's own sign-in on this phone
            if (ck != null) h.setRequestProperty("Cookie", ck);
            int code = h.getResponseCode();
            if (code == 401 || code == 403) { setStatus(c, "Sign in to Larenest to refresh"); return false; }
            if (code != 200) { setStatus(c, "Couldn’t refresh (error " + code + ")"); return false; }
            InputStream in = h.getInputStream(); ByteArrayOutputStream bo = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 60000) break; }
            JSONObject data = new JSONObject(bo.toString("UTF-8")), p = payload(c);
            p.put("data", data);
            save(c, p.toString());
            return true;
        } catch (Exception e) {
            setStatus(c, "Can’t reach your computer");
            return false;
        } finally { if (h != null) h.disconnect(); }
    }

    // ---- background refresh: an inexact repeating alarm (battery friendly); 0 = off ----
    static void schedule(Context c, int minutes) {
        prefs(c).edit().putInt("bg", Math.max(0, minutes)).apply();
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = refreshIntent(c, 900);
        am.cancel(pi);
        if (minutes > 0) { long ms = minutes * 60_000L; am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + ms, ms, pi); }
    }
    static void reschedule(Context c) { schedule(c, prefs(c).getInt("bg", 0)); }

    static PendingIntent refreshIntent(Context c, int code) {
        Intent i = new Intent(c, WidgetRefreshReceiver.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    static PendingIntent openApp(Context c, int code) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}

package com.larenest.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Shader;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

// Draws the four home-screen widgets from the saved summary.
final class WidgetRender {
    private WidgetRender() {}

    static void renderAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        draw(c, m, LarenestWidget.class, R.layout.widget_budget, 0);
        draw(c, m, InvestWidget.class, R.layout.widget_invest, 1);
        draw(c, m, MarketsWidget.class, R.layout.widget_markets, 2);
        draw(c, m, BillsWidget.class, R.layout.widget_bills, 3);
        draw(c, m, MoversWidget.class, R.layout.widget_movers, 4);
    }

    static void draw(Context c, AppWidgetManager m, Class<?> cls, int layout, int kind) {
        int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
        for (int id : ids) m.updateAppWidget(id, build(c, layout, kind, id));
    }

    static final String[] SECTION = { "budget", "holdings", "markets", "subscriptions", "markets" };
    static RemoteViews build(Context c, int layout, int kind, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), layout);
        JSONObject d = WidgetStore.data(c, widgetId);
        boolean hide = WidgetStore.hide(c);
        // tap: open the app at this widget's section, in this widget's dashboard
        v.setOnClickPendingIntent(R.id.w_root, WidgetStore.openApp(c, 1000 + widgetId, SECTION[kind], WidgetStore.bookId(c, widgetId)));
        v.setOnClickPendingIntent(R.id.w_refresh, WidgetStore.refreshIntent(c, 200 + kind));
        v.setTextViewText(R.id.w_updated, WidgetStore.updated(c));
        String name = d == null ? "" : d.optString("name", "");
        if (d == null) { empty(v, kind); return v; }
        switch (kind) {
            case 0: budget(v, d, hide, name); break;
            case 1: invest(v, d, hide); break;
            case 2: markets(v, d, hide); break;
            case 4: movers(v, d, hide); break;
            default: bills(v, d, hide, name); break;
        }
        return v;
    }

    private static void empty(RemoteViews v, int kind) {
        if (kind == 4) { v.setTextViewText(R.id.w_title, "Market movers"); v.setTextViewText(R.id.w_sub, "This widget fills in after you open a dashboard."); v.setViewVisibility(R.id.w_sub, View.VISIBLE); return; }
        v.setViewVisibility(R.id.w_big, View.VISIBLE); v.setTextViewText(R.id.w_big, "Open Larenest");
        v.setTextViewText(R.id.w_sub, "This widget fills in after you open a dashboard.");
        v.setViewVisibility(R.id.w_sub, View.VISIBLE);
    }

    // rows: R.id.w_r1…w_r4 (label) and w_v1…w_v4 (value)
    private static final int[] RL = { R.id.w_r1, R.id.w_r2, R.id.w_r3, R.id.w_r4, R.id.w_r5 };
    private static final int[] RV = { R.id.w_v1, R.id.w_v2, R.id.w_v3, R.id.w_v4, R.id.w_v5 };
    private static void row(RemoteViews v, int i, String label, String value, int color) {
        if (i >= RL.length) return;
        v.setViewVisibility(RL[i], View.VISIBLE); v.setViewVisibility(RV[i], View.VISIBLE);
        v.setTextViewText(RL[i], label); v.setTextViewText(RV[i], value); v.setTextColor(RV[i], color);
    }
    private static void hideRows(RemoteViews v, int from, int max) { for (int i = from; i < Math.min(max, RL.length); i++) { v.setViewVisibility(RL[i], View.GONE); v.setViewVisibility(RV[i], View.GONE); } }

    // ---- Budget & bills: big % used + bar on the left, the next bills on the right ----
    private static void budget(RemoteViews v, JSONObject d, boolean hide, String name) {
        JSONObject b = d.optJSONObject("budget");
        v.setTextViewText(R.id.w_title, (name.isEmpty() ? "Budget" : name) + (b != null && !b.optString("month").isEmpty() ? " · " + b.optString("month") : ""));
        if (b != null && b.optBoolean("has")) {
            double spent = b.optDouble("spent"), avail = b.optDouble("available"); int used = b.optInt("usedPct", 0);
            v.setTextViewText(R.id.w_big, used + "%");
            v.setTextColor(R.id.w_big, used > 100 ? WidgetStore.DOWN : WidgetStore.FG);
            v.setTextViewText(R.id.w_bigsub, "of budget used");
            v.setViewVisibility(R.id.w_bar, View.VISIBLE); v.setProgressBar(R.id.w_bar, 100, Math.min(100, Math.max(0, used)), false);
            String line = hide ? (spent > avail ? "Over budget" : (100 - Math.min(100, used)) + "% left")
                : (spent > avail ? WidgetStore.money0(spent - avail) + " over" : WidgetStore.money0(avail - spent) + " left");
            if (!b.isNull("monthPct")) line += " · " + b.optInt("monthPct") + "% of month";
            v.setTextViewText(R.id.w_sub, line); v.setViewVisibility(R.id.w_sub, View.VISIBLE);
        } else {
            v.setTextViewText(R.id.w_big, "No budget");
            v.setTextColor(R.id.w_big, WidgetStore.MUTED);
            v.setTextViewText(R.id.w_bigsub, "Set one in Budget vs actual");
            v.setViewVisibility(R.id.w_bar, View.GONE); v.setViewVisibility(R.id.w_sub, View.GONE);
        }
        JSONArray bills = d.optJSONArray("bills");
        int n = 0;
        if (bills != null) for (int i = 0; i < bills.length() && n < 3; i++, n++) {
            JSONObject x = bills.optJSONObject(i);
            String when = WidgetStore.when(x.optString("date"), x.optInt("days"));
            row(v, n, x.optString("name"), hide ? when : when + " · " + WidgetStore.money(x.optDouble("amount")), WidgetStore.MUTED);
        }
        hideRows(v, n, 3);
        v.setViewVisibility(R.id.w_nobills, n == 0 ? View.VISIBLE : View.GONE);
    }

    // ---- Investments: value + today's change, a 30-day line, then 7- and 30-day changes ----
    private static void invest(RemoteViews v, JSONObject d, boolean hide) {
        JSONObject x = d.optJSONObject("invest");
        v.setTextViewText(R.id.w_title, "Investments");
        if (x == null || !x.optBoolean("has")) {
            v.setTextViewText(R.id.w_big, "No holdings yet"); v.setTextColor(R.id.w_big, WidgetStore.MUTED);
            v.setTextViewText(R.id.w_sub, "Add them under Wealth → Holdings"); v.setViewVisibility(R.id.w_chart, View.GONE);
            v.setTextViewText(R.id.w_c7, ""); v.setTextViewText(R.id.w_c30, ""); return;
        }
        JSONObject d1 = x.optJSONObject("d1"), d7 = x.optJSONObject("d7"), d30 = x.optJSONObject("d30");
        v.setTextViewText(R.id.w_big, hide ? "Portfolio" : WidgetStore.money0(x.optDouble("value")));
        v.setTextColor(R.id.w_big, WidgetStore.FG);
        if (d1 != null) {
            double p = d1.optDouble("pct");
            v.setTextViewText(R.id.w_sub, WidgetStore.arrow(p) + " " + WidgetStore.pct(p) + (hide ? "" : " (" + (d1.optDouble("chg") >= 0 ? "+" : "−") + WidgetStore.money0(Math.abs(d1.optDouble("chg"))) + ")") + " today");
            v.setTextColor(R.id.w_sub, WidgetStore.tone(p));
        } else v.setTextViewText(R.id.w_sub, "");
        v.setTextViewText(R.id.w_c7, d7 == null ? "7D  –" : "7D  " + WidgetStore.pct(d7.optDouble("pct")));
        v.setTextColor(R.id.w_c7, d7 == null ? WidgetStore.MUTED : WidgetStore.tone(d7.optDouble("pct")));
        v.setTextViewText(R.id.w_c30, d30 == null ? "30D  –" : "30D  " + WidgetStore.pct(d30.optDouble("pct")));
        v.setTextColor(R.id.w_c30, d30 == null ? WidgetStore.MUTED : WidgetStore.tone(d30.optDouble("pct")));
        JSONArray s = x.optJSONArray("series");
        Bitmap bm = spark(s, d30 == null ? WidgetStore.ACCENT : WidgetStore.tone(d30.optDouble("pct")));
        if (bm != null) { v.setImageViewBitmap(R.id.w_chart, bm); v.setViewVisibility(R.id.w_chart, View.VISIBLE); } else v.setViewVisibility(R.id.w_chart, View.GONE);
    }

    // a line with a soft fill, no axes or numbers (so it says nothing about amounts)
    static Bitmap spark(JSONArray s, int color) {
        if (s == null || s.length() < 2) return null;
        int w = 600, h = 150, pad = 8; double lo = Double.MAX_VALUE, hi = -Double.MAX_VALUE; int n = s.length(), ok = 0;
        for (int i = 0; i < n; i++) { if (s.isNull(i)) continue; double y = s.optDouble(i); lo = Math.min(lo, y); hi = Math.max(hi, y); ok++; }
        if (ok < 2) return null;
        if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
        Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); Canvas cv = new Canvas(bm);
        Path line = new Path(), fill = new Path(); boolean started = false; float lastX = 0, firstX = 0;
        for (int i = 0; i < n; i++) {
            if (s.isNull(i)) continue;
            float x = pad + (float) i / (n - 1) * (w - 2 * pad), y = (float) (pad + (1 - (s.optDouble(i) - lo) / (hi - lo)) * (h - 2 * pad));
            if (!started) { line.moveTo(x, y); fill.moveTo(x, h); fill.lineTo(x, y); firstX = x; started = true; } else { line.lineTo(x, y); fill.lineTo(x, y); }
            lastX = x;
        }
        fill.lineTo(lastX, h); fill.lineTo(firstX, h); fill.close();
        Paint pf = new Paint(Paint.ANTI_ALIAS_FLAG); pf.setShader(new LinearGradient(0, 0, 0, h, (color & 0x00FFFFFF) | 0x55000000, color & 0x00FFFFFF, Shader.TileMode.CLAMP)); cv.drawPath(fill, pf);
        Paint pl = new Paint(Paint.ANTI_ALIAS_FLAG); pl.setStyle(Paint.Style.STROKE); pl.setStrokeWidth(5f); pl.setStrokeCap(Paint.Cap.ROUND); pl.setStrokeJoin(Paint.Join.ROUND); pl.setColor(color); cv.drawPath(line, pl);
        return bm;
    }

    // ---- Markets: followed sectors (★) then the rest, and the watchlist ----
    private static void markets(RemoteViews v, JSONObject d, boolean hide) {
        JSONObject mk = d.optJSONObject("markets");
        v.setTextViewText(R.id.w_title, "Markets" + (mk != null ? (mk.optBoolean("open") ? " · Open" : " · Closed") : ""));
        int n = 0;
        if (mk != null) {
            JSONArray sec = mk.optJSONArray("sectors"), w = mk.optJSONArray("watch");
            int nw = w == null ? 0 : Math.min(3, w.length()), ns = sec == null ? 0 : Math.min(5 - nw, sec.length());
            if (nw > 0 && ns > 3) ns = 3;
            for (int i = 0; i < ns; i++, n++) { JSONObject x = sec.optJSONObject(i); double p = x.optDouble("pct");
                row(v, n, (x.optBoolean("followed") ? "★ " : "") + x.optString("name"), WidgetStore.arrow(p) + " " + WidgetStore.pct(p), WidgetStore.tone(p)); }
            for (int i = 0; i < nw && n < 5; i++, n++) { JSONObject x = w.optJSONObject(i);
                String val = x.isNull("pct") ? "–" : WidgetStore.arrow(x.optDouble("pct")) + " " + WidgetStore.pct(x.optDouble("pct"));
                if (!x.isNull("price")) val = WidgetStore.money(x.optDouble("price")) + "  " + val; // public prices, shown even with hide amounts
                row(v, n, x.optString("sym"), val, x.isNull("pct") ? WidgetStore.MUTED : WidgetStore.tone(x.optDouble("pct"))); }
        }
        hideRows(v, n, 5);
        v.setViewVisibility(R.id.w_sub, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_sub, "Follow sectors (☆) and add stocks to your watchlist under Markets.");
    }

    // ---- Bills & subscriptions: monthly subscription total and the next bills ----
    private static void bills(RemoteViews v, JSONObject d, boolean hide, String name) {
        v.setTextViewText(R.id.w_title, "Bills & subscriptions");
        double subs = d.optDouble("monthlySubs", 0);
        v.setTextViewText(R.id.w_big, hide ? "Coming up" : WidgetStore.money0(subs) + "/mo");
        v.setTextViewText(R.id.w_bigsub, hide ? "next 30 days" : "in recurring charges");
        JSONArray bills = d.optJSONArray("bills"); int n = 0;
        if (bills != null) for (int i = 0; i < bills.length() && n < 5; i++, n++) {
            JSONObject x = bills.optJSONObject(i); String when = WidgetStore.when(x.optString("date"), x.optInt("days"));
            row(v, n, when + "  " + x.optString("name"), hide ? "" : WidgetStore.money(x.optDouble("amount")), x.optInt("days") <= 2 ? WidgetStore.GOLD : WidgetStore.FG);
        }
        hideRows(v, n, 5);
        v.setViewVisibility(R.id.w_sub, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_sub, "Nothing due in the next 30 days.");
    }

    // ---- Market movers (wide): today's biggest gainers and losers side by side ----
    private static final int[] GS = { R.id.w_g1, R.id.w_g2, R.id.w_g3, R.id.w_g4, R.id.w_g5 }, GV = { R.id.w_gv1, R.id.w_gv2, R.id.w_gv3, R.id.w_gv4, R.id.w_gv5 };
    private static final int[] LS = { R.id.w_l1, R.id.w_l2, R.id.w_l3, R.id.w_l4, R.id.w_l5 }, LV = { R.id.w_lv1, R.id.w_lv2, R.id.w_lv3, R.id.w_lv4, R.id.w_lv5 };
    private static void movers(RemoteViews v, JSONObject d, boolean hide) {
        JSONObject mk = d.optJSONObject("markets");
        v.setTextViewText(R.id.w_title, "Market movers" + (mk != null ? (mk.optBoolean("open") ? " · Open" : " · Closed") : ""));
        int a = col(v, mk == null ? null : mk.optJSONArray("gainers"), GS, GV, hide), b = col(v, mk == null ? null : mk.optJSONArray("losers"), LS, LV, hide);
        v.setViewVisibility(R.id.w_sub, a + b == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_sub, "Movers need a free Financial Modeling Prep key (Settings → Data sources).");
    }
    private static int col(RemoteViews v, JSONArray l, int[] sym, int[] val, boolean hide) {
        int n = l == null ? 0 : Math.min(5, l.length());
        for (int i = 0; i < 5; i++) {
            if (i >= n) { v.setViewVisibility(sym[i], View.INVISIBLE); v.setViewVisibility(val[i], View.INVISIBLE); continue; }
            JSONObject x = l.optJSONObject(i); double p = x.optDouble("pct");
            v.setViewVisibility(sym[i], View.VISIBLE); v.setViewVisibility(val[i], View.VISIBLE);
            v.setTextViewText(sym[i], (x.optBoolean("mine") ? "★ " : "") + x.optString("sym"));
            String t = WidgetStore.arrow(p) + " " + WidgetStore.pct(p); if (!x.isNull("price")) /* public market prices: shown even with hide amounts */ t = WidgetStore.money(x.optDouble("price")) + "  " + t;
            v.setTextViewText(val[i], t); v.setTextColor(val[i], WidgetStore.tone(p));
        }
        return n;
    }
}

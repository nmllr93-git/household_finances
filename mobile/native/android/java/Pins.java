package com.larenest.app;

import android.content.Context;
import android.net.http.SslCertificate;
import android.os.Bundle;
import java.security.MessageDigest;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.HashSet;
import java.util.Set;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

// The certificates this app trusts for your own Larenest computer(s): each one pinned by its SHA-256 fingerprint,
// learned from the QR code (or the first time you connected). Anything else gets Android's normal checks.
final class Pins {
    private Pins() {}
    private static final String PREFS = "larenest_tls";

    static void add(Context c, String host, String fp) {
        if (fp == null || !fp.matches("[0-9A-Fa-f]{64}")) return;
        Set<String> s = new HashSet<>(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("fps", new HashSet<>()));
        s.add(fp.toUpperCase()); if (s.size() > 20) { s.clear(); s.add(fp.toUpperCase()); }
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet("fps", s).apply();
    }
    static boolean has(Context c, String fp) { return fp != null && c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("fps", new HashSet<>()).contains(fp); }

    static String fp(byte[] der) {
        try { byte[] h = MessageDigest.getInstance("SHA-256").digest(der); StringBuilder b = new StringBuilder(); for (byte x : h) b.append(String.format("%02X", x)); return b.toString(); }
        catch (Exception e) { return ""; }
    }
    // the WebView reports a certificate it doesn't know: is it one we pinned?
    static boolean trusted(Context c, SslCertificate cert) {
        try { Bundle b = SslCertificate.saveState(cert); byte[] der = b == null ? null : b.getByteArray("x509-certificate"); return der != null && has(c, fp(der)); }
        catch (Exception e) { return false; }
    }

    // for the widgets' background refresh (HttpsURLConnection): system trust first, then our pins
    static SSLSocketFactory socketFactory(final Context c) {
        try {
            TrustManagerFactory tf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()); tf.init((java.security.KeyStore) null);
            final X509TrustManager sys = (X509TrustManager) tf.getTrustManagers()[0];
            X509TrustManager tm = new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] ch, String a) throws CertificateException { sys.checkClientTrusted(ch, a); }
                public void checkServerTrusted(X509Certificate[] ch, String a) throws CertificateException {
                    try { sys.checkServerTrusted(ch, a); } catch (CertificateException e) { if (ch == null || ch.length == 0 || !has(c, fp(ch[0].getEncoded()))) throw e; } }
                public X509Certificate[] getAcceptedIssuers() { return sys.getAcceptedIssuers(); }
            };
            SSLContext ctx = SSLContext.getInstance("TLS"); ctx.init(null, new TrustManager[] { tm }, null); return ctx.getSocketFactory();
        } catch (Exception e) { return null; }
    }
    // pinned certificates are trusted by fingerprint, so the name in them doesn't have to match the address
    static HostnameVerifier verifier(final Context c) {
        final HostnameVerifier def = javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier();
        return (host, session) -> { if (def.verify(host, session)) return true;
            try { java.security.cert.Certificate[] ch = session.getPeerCertificates(); return ch.length > 0 && has(c, fp(ch[0].getEncoded())); } catch (Exception e) { return false; } };
    }
}

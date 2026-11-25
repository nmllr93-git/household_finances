package com.larenest.app;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Fingerprint / face unlock for the app lock (phone-only mode). Only says yes or no: no keys or data pass through here.
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
    private static final int KINDS = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject r = new JSObject();
        r.put("available", BiometricManager.from(getContext()).canAuthenticate(KINDS) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(r);
    }

    @PluginMethod
    public void verify(PluginCall call) {
        final String reason = call.getString("reason", "Unlock Larenest");
        final FragmentActivity act = getActivity();
        act.runOnUiThread(() -> {
            BiometricPrompt p = new BiometricPrompt(act, ContextCompat.getMainExecutor(act), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { JSObject r = new JSObject(); r.put("ok", true); call.resolve(r); }
                @Override public void onAuthenticationError(int code, CharSequence msg) { JSObject r = new JSObject(); r.put("ok", false); r.put("error", String.valueOf(msg)); call.resolve(r); }
                @Override public void onAuthenticationFailed() { /* a finger that didn't match: the prompt stays open for another try */ }
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder().setTitle(reason).setNegativeButtonText("Use PIN").setAllowedAuthenticators(KINDS).build();
            p.authenticate(info);
        });
    }
}

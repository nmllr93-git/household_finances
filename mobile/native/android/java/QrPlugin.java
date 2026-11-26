package com.larenest.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

// Scan the QR code the computer shows (Host options / Settings → Connect a phone) with Google's own scanner screen.
// The scanner runs in Google Play services, so the app doesn't need camera access for it; only the scanned text comes back.
@CapacitorPlugin(name = "QrScan")
public class QrPlugin extends Plugin {
    @PluginMethod
    public void scan(PluginCall call) {
        GmsBarcodeScannerOptions opts = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), opts);
        scanner.startScan()
            .addOnSuccessListener(b -> { JSObject r = new JSObject(); r.put("value", b.getRawValue()); call.resolve(r); })
            .addOnCanceledListener(() -> { JSObject r = new JSObject(); r.put("cancelled", true); call.resolve(r); })
            .addOnFailureListener(e -> call.reject("The scanner couldn't start: " + e.getMessage()));
    }
}

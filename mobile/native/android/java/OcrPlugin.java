package com.larenest.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

// Receipt scanning: reads the text in a photo on the phone (ML Kit's on-device Latin model). Nothing is uploaded.
@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {
    // shared with the page bridge in MainActivity (pages served by your computer); call off the main thread
    static String readText(String b64) throws Exception {
        if (b64 == null || b64.length() > 12_000_000) return "";
        byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
        Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bmp == null) return "";
        Text t = Tasks.await(TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(InputImage.fromBitmap(bmp, 0)));
        StringBuilder sb = new StringBuilder();
        for (Text.TextBlock b : t.getTextBlocks()) for (Text.Line l : b.getLines()) sb.append(l.getText()).append('\n');
        return sb.toString();
    }

    @PluginMethod
    public void read(PluginCall call) {
        final String data = call.getString("data", "");
        new Thread(() -> {
            try { JSObject r = new JSObject(); r.put("text", readText(data)); call.resolve(r); }
            catch (Exception e) { call.reject("Couldn’t read the photo: " + e.getMessage()); }
        }).start();
    }
}

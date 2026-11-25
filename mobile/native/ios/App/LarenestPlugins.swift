import Foundation
import UIKit
import Capacitor
import LocalAuthentication
import Vision
import WidgetKit

// The app's own native pieces on iPhone, registered by LarenestViewController:
//   Biometric       Face ID / Touch ID for the app lock (phone-only mode). Only answers yes or no.
//   Ocr             receipt scanning: reads the text in a photo with Apple's Vision, on the phone.
//   LarenestWidget  hands the dashboard's summary to the home-screen widget (shared through the app group).
let larenestAppGroup = "group.com.larenest.app"

@objc(BiometricPlugin)
public class BiometricPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BiometricPlugin"
    public let jsName = "Biometric"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verify", returnType: CAPPluginReturnPromise),
    ]
    @objc func available(_ call: CAPPluginCall) {
        var err: NSError?
        call.resolve(["available": LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)])
    }
    @objc func verify(_ call: CAPPluginCall) {
        let ctx = LAContext(); ctx.localizedCancelTitle = "Use PIN"
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: call.getString("reason") ?? "Unlock Larenest") { ok, error in
            call.resolve(["ok": ok, "error": error?.localizedDescription ?? ""])
        }
    }
}

@objc(OcrPlugin)
public class OcrPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OcrPlugin"
    public let jsName = "Ocr"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise)]
    @objc func read(_ call: CAPPluginCall) {
        guard let s = call.getString("data"), s.count < 12_000_000, let d = Data(base64Encoded: s, options: .ignoreUnknownCharacters),
              let img = UIImage(data: d), let cg = img.cgImage else { call.resolve(["text": ""]); return }
        DispatchQueue.global(qos: .userInitiated).async {
            let req = VNRecognizeTextRequest()
            req.recognitionLevel = .accurate
            req.usesLanguageCorrection = true
            do {
                try VNImageRequestHandler(cgImage: cg, orientation: .up, options: [:]).perform([req])
                // top to bottom, then left to right, so the lines read like the receipt
                let obs = (req.results ?? []).sorted { a, b in
                    abs(a.boundingBox.midY - b.boundingBox.midY) > 0.01 ? a.boundingBox.midY > b.boundingBox.midY : a.boundingBox.minX < b.boundingBox.minX
                }
                var lines: [String] = []; var lastY: CGFloat = -1
                for o in obs {
                    guard let t = o.topCandidates(1).first?.string else { continue }
                    if lastY >= 0 && abs(o.boundingBox.midY - lastY) <= 0.01, let prev = lines.popLast() { lines.append(prev + "  " + t) } else { lines.append(t) }
                    lastY = o.boundingBox.midY
                }
                call.resolve(["text": lines.joined(separator: "\n")])
            } catch { call.reject("Couldn’t read the photo: \(error.localizedDescription)") }
        }
    }
}

@objc(LarenestWidgetPlugin)
public class LarenestWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LarenestWidgetPlugin"
    public let jsName = "LarenestWidget"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)]
    @objc func update(_ call: CAPPluginCall) {
        let s = call.getString("data") ?? ""
        guard s.count < 400_000, let defaults = UserDefaults(suiteName: larenestAppGroup) else { call.resolve(["ok": false]); return }
        defaults.set(s, forKey: "summary")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["ok": true])
    }
}

class LarenestViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(BiometricPlugin())
        bridge?.registerPluginInstance(OcrPlugin())
        bridge?.registerPluginInstance(LarenestWidgetPlugin())
    }
}

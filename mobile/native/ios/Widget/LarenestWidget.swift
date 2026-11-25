import WidgetKit
import SwiftUI

// iPhone home-screen widget: this month's budget and the next bills, from the summary the app saves
// (LarenestWidgetPlugin → app group). The widget never goes online itself; it updates when the app does.
private let appGroup = "group.com.larenest.app"

struct Bill: Identifiable { let id = UUID(); let name: String; let amount: Double; let days: Int }
struct Summary {
    var name = ""; var month = ""; var hasBudget = false; var spent = 0.0; var available = 0.0; var usedPct: Double? = nil; var monthPct: Double? = nil
    var bills: [Bill] = []; var hide = false; var at: Date? = nil
    static func load() -> Summary? {
        guard let s = UserDefaults(suiteName: appGroup)?.string(forKey: "summary"), let d = s.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let data = root["data"] as? [String: Any] else { return nil }
        var o = Summary()
        o.name = data["name"] as? String ?? ""
        if let cfg = root["cfg"] as? [String: Any] { o.hide = cfg["hide"] as? Bool ?? false }
        if let b = data["budget"] as? [String: Any] {
            o.hasBudget = b["has"] as? Bool ?? false; o.month = b["month"] as? String ?? ""
            o.spent = (b["spent"] as? NSNumber)?.doubleValue ?? 0; o.available = (b["available"] as? NSNumber)?.doubleValue ?? 0
            o.usedPct = (b["usedPct"] as? NSNumber)?.doubleValue; o.monthPct = (b["monthPct"] as? NSNumber)?.doubleValue
        }
        for x in (data["bills"] as? [[String: Any]] ?? []).prefix(4) {
            o.bills.append(Bill(name: x["name"] as? String ?? "", amount: (x["amount"] as? NSNumber)?.doubleValue ?? 0, days: (x["days"] as? NSNumber)?.intValue ?? 0))
        }
        if let a = data["at"] as? String { o.at = ISO8601DateFormatter().date(from: a) }
        return o
    }
}

struct Entry: TimelineEntry { let date: Date; let s: Summary? }

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry {
        Entry(date: Date(), s: Summary(name: "Personal", month: "Nov", hasBudget: true, spent: 1840, available: 2600, usedPct: 71, monthPct: 80, bills: [Bill(name: "Rent", amount: 1450, days: 3), Bill(name: "Phone", amount: 85, days: 6)]))
    }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Summary.load().map { Entry(date: Date(), s: $0) } ?? placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        // re-read the saved summary every hour (bill "in N days" labels move on); the app pushes fresh numbers when it's opened
        completion(Timeline(entries: [Entry(date: Date(), s: Summary.load())], policy: .after(Date().addingTimeInterval(3600))))
    }
}

private func money(_ v: Double, hide: Bool) -> String {
    if hide { return "•••" }
    let f = NumberFormatter(); f.numberStyle = .currency; f.locale = Locale(identifier: "en_US"); f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: v)) ?? "$\(Int(v))"
}
private func when(_ d: Int) -> String { d <= 0 ? "today" : d == 1 ? "tomorrow" : "in \(d) days" }
private let gold = Color(red: 0.78, green: 0.58, blue: 0.2)

struct BudgetView: View {
    let e: Entry
    @Environment(\.widgetFamily) var family
    var body: some View {
        if let s = e.s {
            VStack(alignment: .leading, spacing: 6) {
                Text(s.name.isEmpty ? "Budget" : s.name + (s.month.isEmpty ? "" : " · " + s.month)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if s.hasBudget {
                    Text(money(s.spent, hide: s.hide)).font(.title2).bold().minimumScaleFactor(0.6).lineLimit(1)
                    Text("of " + money(s.available, hide: s.hide)).font(.caption).foregroundStyle(.secondary)
                    let used = min(1, max(0, (s.usedPct ?? 0) / 100)), over = (s.usedPct ?? 0) > (s.monthPct ?? 100)
                    ProgressView(value: used).tint(over ? gold : .green)
                } else {
                    Text("No budget this month").font(.footnote).foregroundStyle(.secondary)
                }
                if family != .systemSmall {
                    Divider()
                    if s.bills.isEmpty { Text("No bills in the next 30 days").font(.caption).foregroundStyle(.secondary) }
                    ForEach(s.bills.prefix(3)) { b in
                        HStack { Text(b.name).font(.caption).lineLimit(1); Spacer(); Text(when(b.days) + (s.hide ? "" : " · " + money(b.amount, hide: false))).font(.caption).foregroundStyle(b.days <= 2 ? gold : .secondary) }
                    }
                } else if let b = s.bills.first {
                    Text("Next: \(b.name) \(when(b.days))").font(.caption2).foregroundStyle(b.days <= 2 ? gold : .secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("Larenest").font(.headline)
                Text("Open the app once to fill in this widget.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

extension View {
    @ViewBuilder func widgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) { containerBackground(.fill.tertiary, for: .widget) } else { padding().background(Color(.systemBackground)) }
    }
}

struct BudgetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LarenestBudget", provider: Provider()) { e in BudgetView(e: e).widgetBackground() }
            .configurationDisplayName("Budget & bills")
            .description("This month's budget and the next bills due.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct LarenestWidgets: WidgetBundle {
    var body: some Widget { BudgetWidget() }
}

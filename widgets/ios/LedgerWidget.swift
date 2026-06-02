// LedgerWidget.swift
// iOS / macOS / watchOS widget using WidgetKit
// Supports: Home Screen (small/medium/large), Lock Screen, Apple Watch Complication

import WidgetKit
import SwiftUI
import Combine

// ─────────────────────────────────────────────
// MODEL
// ─────────────────────────────────────────────

struct FinancialSnapshot: Codable {
    var netWorth: Double
    var cash: Double
    var investments: Double
    var retirement: Double
    var totalDebt: Double
    var monthlyBills: Double
    var lastUpdated: Date

    static let placeholder = FinancialSnapshot(
        netWorth: 284674,
        cash: 18920,
        investments: 265754,
        retirement: 102843,
        totalDebt: 4327,
        monthlyBills: 2842,
        lastUpdated: Date()
    )
}

// ─────────────────────────────────────────────
// TIMELINE PROVIDER
// ─────────────────────────────────────────────

struct LedgerProvider: TimelineProvider {
    let apiURL = "https://api.yourledger.app"  // Replace with production URL

    func placeholder(in context: Context) -> LedgerEntry {
        LedgerEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (LedgerEntry) -> Void) {
        fetchSnapshot { snap in
            completion(LedgerEntry(date: Date(), snapshot: snap ?? .placeholder))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LedgerEntry>) -> Void) {
        fetchSnapshot { snap in
            let entry = LedgerEntry(date: Date(), snapshot: snap ?? .placeholder)
            // Refresh every 15 minutes
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
        }
    }

    private func fetchSnapshot(completion: @escaping (FinancialSnapshot?) -> Void) {
        guard let token = Keychain.get("ledger_auth_token"),
              let url = URL(string: "\(apiURL)/api/ai/insights") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 10

        URLSession.shared.dataTask(with: req) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ctx = json["context"] as? [String: Any] else {
                completion(nil); return
            }
            let snap = FinancialSnapshot(
                netWorth:     ctx["net_worth"]     as? Double ?? 0,
                cash:         ctx["cash"]          as? Double ?? 0,
                investments:  ctx["investments"]   as? Double ?? 0,
                retirement:   ctx["retirement"]    as? Double ?? 0,
                totalDebt:    ctx["total_debt"]    as? Double ?? 0,
                monthlyBills: ctx["monthly_bills"] as? Double ?? 0,
                lastUpdated:  Date()
            )
            completion(snap)
        }.resume()
    }
}

struct LedgerEntry: TimelineEntry {
    let date: Date
    let snapshot: FinancialSnapshot
}

// ─────────────────────────────────────────────
// VIEWS
// ─────────────────────────────────────────────

// Small widget — net worth only
struct SmallWidgetView: View {
    let snapshot: FinancialSnapshot

    var body: some View {
        ZStack {
            Color.black
            VStack(alignment: .leading, spacing: 4) {
                Text("NET WORTH")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundColor(.gray)
                    .tracking(1)
                Text(snapshot.netWorth.formatted(.currency(code: "USD").precision(.fractionLength(0))))
                    .font(.system(size: 22, weight: .semibold, design: .monospaced))
                    .foregroundColor(Color(hex: "#16c784"))
                    .minimumScaleFactor(0.6)
                Spacer()
                Text("ledger")
                    .font(.system(size: 11, weight: .regular, design: .serif))
                    .italic()
                    .foregroundColor(Color(hex: "#d4af37"))
            }
            .padding(14)
        }
        .containerBackground(.black, for: .widget)
    }
}

// Medium widget — net worth + key metrics
struct MediumWidgetView: View {
    let snapshot: FinancialSnapshot

    var body: some View {
        ZStack {
            Color(hex: "#0a0a0f")
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("ledger")
                        .font(.system(size: 13, weight: .regular, design: .serif))
                        .italic()
                        .foregroundColor(Color(hex: "#d4af37"))
                    Spacer()
                    Text(snapshot.lastUpdated, style: .time)
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(.gray)
                }
                .padding(.horizontal, 14)
                .padding(.top, 12)

                Divider().overlay(Color.white.opacity(0.08))

                // Metrics grid
                HStack(spacing: 0) {
                    MetricCell(label: "NET WORTH", value: snapshot.netWorth, color: Color(hex: "#16c784"))
                    Divider().frame(width: 1).overlay(Color.white.opacity(0.08))
                    MetricCell(label: "CASH", value: snapshot.cash, color: .white)
                    Divider().frame(width: 1).overlay(Color.white.opacity(0.08))
                    MetricCell(label: "INVESTMENTS", value: snapshot.investments, color: Color(hex: "#a78bfa"))
                    Divider().frame(width: 1).overlay(Color.white.opacity(0.08))
                    MetricCell(label: "DEBT", value: snapshot.totalDebt, color: snapshot.totalDebt > 0 ? Color(hex: "#f04f54") : Color(hex: "#16c784"))
                }
                .frame(maxHeight: .infinity)
            }
        }
        .containerBackground(Color(hex: "#0a0a0f"), for: .widget)
    }
}

struct MetricCell: View {
    let label: String
    let value: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label)
                .font(.system(size: 7.5, weight: .semibold))
                .foregroundColor(.gray)
                .tracking(0.8)
            Text(value.compactFormatted)
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(color)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }
}

// Lock screen widget — accessory rectangular
struct LockScreenWidgetView: View {
    let snapshot: FinancialSnapshot

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.system(size: 14, weight: .medium))
            VStack(alignment: .leading, spacing: 1) {
                Text("Net Worth")
                    .font(.system(size: 9, weight: .medium))
                Text(snapshot.netWorth.compactFormatted)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
            }
        }
        .containerBackground(.clear, for: .widget)
    }
}

// ─────────────────────────────────────────────
// WIDGET DEFINITION
// ─────────────────────────────────────────────

struct LedgerWidget: Widget {
    let kind = "LedgerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LedgerProvider()) { entry in
            LedgerWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Ledger")
        .description("Your financial cockpit — always visible.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryRectangular,
            .accessoryCircular,
        ])
    }
}

struct LedgerWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: LedgerEntry

    var body: some View {
        switch family {
        case .systemSmall:    SmallWidgetView(snapshot: entry.snapshot)
        case .systemMedium:   MediumWidgetView(snapshot: entry.snapshot)
        case .accessoryRectangular: LockScreenWidgetView(snapshot: entry.snapshot)
        default:              SmallWidgetView(snapshot: entry.snapshot)
        }
    }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

extension Double {
    var compactFormatted: String {
        if self >= 1_000_000 { return String(format: "$%.1fM", self / 1_000_000) }
        if self >= 1_000     { return String(format: "$%.0fk", self / 1_000) }
        return String(format: "$%.0f", self)
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: .init(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&rgb)
        self.init(
            red:   Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8)  & 0xFF) / 255,
            blue:  Double(rgb         & 0xFF) / 255
        )
    }
}

// Minimal keychain helper
enum Keychain {
    static func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String:  true,
            kSecMatchLimit as String:  kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

// ─────────────────────────────────────────────
// WATCH COMPLICATION (WatchOS extension target)
// ─────────────────────────────────────────────

// Add a separate WatchOS extension target in Xcode and use the same
// LedgerProvider. The complication entry view:
//
// struct WatchComplication: View {
//     let entry: LedgerEntry
//     var body: some View {
//         VStack(spacing: 2) {
//             Text(entry.snapshot.netWorth.compactFormatted)
//                 .font(.system(size: 14, weight: .bold, design: .monospaced))
//                 .foregroundColor(.green)
//             Text("NW").font(.caption2).foregroundColor(.gray)
//         }
//     }
// }

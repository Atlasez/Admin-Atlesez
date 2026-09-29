import SwiftUI

enum NativeActionFilter: String, CaseIterable, Identifiable {
    case open
    case urgent
    case approvals
    case history

    var id: String { rawValue }
    var title: String {
        switch self {
        case .open: "要対応"
        case .urgent: "期限・緊急"
        case .approvals: "承認待ち"
        case .history: "完了履歴"
        }
    }
}

struct NativeAPIMessage: Decodable {
    let error: String?
}

struct NativeTransitionResponse: Decodable {
    let ok: Bool?
}

enum NativeAPIError: LocalizedError {
    case sessionExpired
    case permissionDenied
    case invalidURL
    case unexpectedResponse
    case invalidPayload
    case server(String)

    var errorDescription: String? {
        switch self {
        case .sessionExpired: "ログインの有効期限が切れました。もう一度ログインしてください。"
        case .permissionDenied: "この操作を行う権限がありません。権限を確認してください。"
        case .invalidURL: "接続先を確認できませんでした。"
        case .unexpectedResponse: "運営サイトから応答を受け取れませんでした。"
        case .invalidPayload: "運営データの形式を確認できませんでした。再読み込みしてください。"
        case .server(let message): message
        }
    }
}

struct NativePortalPayload: Decodable {
    let email: String?
    let pendingApprovals: Int?
    let projects: [NativeProject]?
    let todos: [NativePortalTask]?
    let taskSummary: NativeTaskSummary?
    let unreadNotificationsCount: Int?
    let calendar: NativeCalendarPayload?
}

struct NativeProject: Decodable, Identifiable {
    let id: String
    let slug: String?
    let name: String
    let role: String?
    let description: String?
}

struct NativeTaskSummary: Decodable {
    let openCount: Int?
    let dueToday: Int?
    let dueSoon: Int?
}

struct NativePortalTask: Decodable, Identifiable {
    let id: String
    let title: String
    let details: String?
    let due_at: String?
    let project_name: String?
    let project_id: String?
    let status: String?
}

struct NativeCalendarPayload: Decodable {
    let events: [NativeCalendarEvent]?
}

struct NativeCalendarEvent: Decodable, Identifiable {
    let id: String
    let title: String
    let details: String?
    let startsAt: String?
    let endsAt: String?
    let timezone: String?
    let projectName: String?
}

struct NativeActionPayload: Decodable {
    let items: [NativeActionItem]?
    let history: [NativeActionItem]?
    let counts: NativeActionCounts?
    let generatedAt: String?
}

struct NativeActionCounts: Decodable {
    let today: Int?
    let dueSoon: Int?
    let approvals: Int?
    let assigned: Int?
    let assignedItemsTruncated: Bool?
}

struct NativeWorkflowAction: Decodable, Identifiable {
    let entityType: String
    let entityId: String
    let fromState: String
    let toState: String
    let label: String
    let expectedUpdatedAt: String?
    let approvalRequestType: String?

    var id: String { "\(entityType):\(entityId):\(toState)" }
}

struct NativeActionItem: Decodable, Identifiable {
    let id: String
    let kind: String
    let title: String
    let detail: String?
    let href: String
    let status: String?
    let priority: String?
    let updatedAt: String?
    let dueAt: String?
    let project: String?
    let subject: String?
    let read: Bool?
    let actions: [NativeWorkflowAction]?
}

struct NativePortalView: View {
    @ObservedObject var model: AdminAppModel

    private var tasks: [NativePortalTask] { Array(model.portal?.todos ?? []) }
    private var events: [NativeCalendarEvent] {
        let now = Date()
        return (model.portal?.calendar?.events ?? [])
            .filter { event in
                guard let startsAt = event.startsAt, let date = NativeDate.parse(startsAt) else { return false }
                return date >= now
            }
            .sorted { ($0.startsAt ?? "") < ($1.startsAt ?? "") }
            .prefix(5)
            .map { $0 }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("おかえりなさい")
                            .font(.system(size: 27, weight: .semibold, design: .rounded))
                        Text(model.portal?.email ?? "運営ワークスペース")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(Date.now.formatted(date: .complete, time: .omitted))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }

                if model.portalLoading && model.portal == nil {
                    NativeLoadingState(title: "運営状況を読み込んでいます")
                } else if let error = model.portalError, model.portal == nil {
                    NativeErrorState(message: error) { model.loadPortal() }
                } else {
                    HStack(spacing: 12) {
                        NativeMetric(title: "未完了タスク", value: model.portal?.taskSummary?.openCount ?? tasks.count, symbol: "checkmark.circle", action: { model.navigate(to: "/admin/member-tasks/") })
                        NativeMetric(title: "今日が期限", value: model.portal?.taskSummary?.dueToday ?? 0, symbol: "clock", action: { model.navigate(to: "/admin/member-tasks/") })
                        NativeMetric(title: "承認待ち", value: model.portal?.pendingApprovals ?? 0, symbol: "person.badge.clock", action: { model.navigate(to: "/admin/action-center/") })
                        NativeMetric(title: "未読通知", value: model.portal?.unreadNotificationsCount ?? 0, symbol: "bell", action: { model.navigate(to: "/admin/notifications/") })
                    }

                    HStack(alignment: .top, spacing: 18) {
                        VStack(alignment: .leading, spacing: 12) {
                            NativeSectionHeading("自分の作業", actionTitle: "すべて見る") { model.navigate(to: "/admin/member-tasks/") }
                            if tasks.isEmpty {
                                NativeEmptyState(title: "未完了タスクはありません", subtitle: "担当タスクがここに表示されます。")
                            } else {
                                VStack(spacing: 0) {
                                    ForEach(tasks.prefix(8)) { task in
                                        Button { model.navigate(to: "/admin/member-tasks/?focus=\(task.id)") } label: {
                                            HStack(spacing: 12) {
                                                Image(systemName: task.status == "doing" ? "circle.lefthalf.filled" : "circle")
                                                    .foregroundStyle(Color.accentColor)
                                                VStack(alignment: .leading, spacing: 3) {
                                                    Text(task.title).font(.system(size: 14, weight: .medium)).lineLimit(1)
                                                    Text([task.project_name, task.due_at.map(NativeDate.short)].compactMap { $0 }.joined(separator: " · "))
                                                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                                }
                                                Spacer(minLength: 8)
                                                Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.tertiary)
                                            }
                                            .padding(.vertical, 11)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        if task.id != tasks.prefix(8).last?.id { Divider() }
                                    }
                                }
                                .padding(.horizontal, 14)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        VStack(alignment: .leading, spacing: 12) {
                            NativeSectionHeading("これからの予定", actionTitle: "カレンダー") { model.navigate(to: "/admin/member-calendar/") }
                            if events.isEmpty {
                                NativeEmptyState(title: "直近の予定はありません", subtitle: "予定が登録されるとここに表示されます。")
                            } else {
                                VStack(alignment: .leading, spacing: 0) {
                                    ForEach(events) { event in
                                        HStack(alignment: .top, spacing: 12) {
                                            VStack(spacing: 0) {
                                                Text(NativeDate.day(event.startsAt)).font(.system(size: 18, weight: .bold, design: .rounded))
                                                Text(NativeDate.month(event.startsAt)).font(.caption2).foregroundStyle(.secondary)
                                            }
                                            .frame(width: 42)
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(event.title).font(.system(size: 14, weight: .medium)).lineLimit(2)
                                                Text([event.projectName, event.startsAt.map(NativeDate.time)].compactMap { $0 }.joined(separator: " · "))
                                                    .font(.caption).foregroundStyle(.secondary)
                                            }
                                            Spacer(minLength: 0)
                                        }
                                        .padding(.vertical, 11)
                                        Divider()
                                    }
                                }
                                .padding(.horizontal, 14)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        NativeSectionHeading("参加中のプロジェクト", actionTitle: nil, action: nil)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], alignment: .leading, spacing: 12) {
                            ForEach(model.portal?.projects ?? []) { project in
                                HStack(spacing: 12) {
                                    Image(systemName: "square.stack.3d.up")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundStyle(Color.accentColor)
                                        .frame(width: 34, height: 34)
                                        .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 9))
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(project.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                        Text(project.role ?? "参加中").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(13)
                                .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                }
            }
            .padding(28)
            .frame(maxWidth: 1180, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .overlay(alignment: .topTrailing) {
            if model.portalLoading && model.portal != nil { ProgressView().controlSize(.small).padding(16) }
        }
        .task { if model.portal == nil { model.loadPortal() } }
    }
}

struct NativeActionCenterView: View {
    @ObservedObject var model: AdminAppModel
    @State private var query = ""
    @State private var rejection: PendingNativeAction?

    private var sourceItems: [NativeActionItem] {
        guard let payload = model.actions else { return [] }
        return model.actionFilter == .history ? (payload.history ?? []) : (payload.items ?? [])
    }

    private var visibleItems: [NativeActionItem] {
        sourceItems.filter { item in
            if model.actionFilter == .urgent && !["urgent", "due-soon"].contains(item.priority ?? "") { return false }
            if model.actionFilter == .approvals && item.kind != "approval" { return false }
            if !query.isEmpty && !"\(item.title) \(item.detail ?? "") \(item.project ?? "") \(item.subject ?? "")".localizedCaseInsensitiveContains(query) { return false }
            return true
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Picker("表示", selection: Binding(get: { model.actionFilter }, set: model.setActionFilter)) {
                    ForEach(NativeActionFilter.allCases) { filter in Text(filter.title).tag(filter) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 520)
                Spacer()
                Text("\(visibleItems.count)件")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                TextField("項目を検索", text: $query)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 230)
                    .accessibilityLabel("対応項目を検索")
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 14)
            Divider()

            if let notice = model.actionNotice {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
                    Text(notice).font(.callout).lineLimit(2)
                    Spacer()
                    Button("閉じる") { model.actionNotice = nil }.buttonStyle(.link)
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 10)
                .background(Color.orange.opacity(0.08))
            }

            if model.actionsLoading && model.actions == nil {
                NativeLoadingState(title: "対応項目を読み込んでいます")
            } else if let error = model.actionsError, model.actions == nil {
                NativeErrorState(message: error) { model.loadActions() }
            } else if visibleItems.isEmpty {
                NativeEmptyState(title: model.actionFilter == .history ? "完了履歴はありません" : "対応が必要な項目はありません", subtitle: "絞り込み条件を変えるか、あとで再読み込みしてください。")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 9) {
                        ForEach(visibleItems) { item in
                            NativeActionRow(item: item, isPending: model.pendingActionIds.contains(item.id), onOpen: { model.openAction(item) }, onPerform: { action in
                                if action.toState == "rejected" {
                                    rejection = PendingNativeAction(item: item, action: action)
                                } else {
                                    model.perform(action, for: item)
                                }
                            })
                        }
                    }
                    .padding(18)
                    .frame(maxWidth: 1120, alignment: .leading)
                    .frame(maxWidth: .infinity, alignment: .center)
                }
                .overlay(alignment: .topTrailing) {
                    if model.actionsLoading { ProgressView().controlSize(.small).padding(12) }
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .task { if model.actions == nil { model.loadActions() } }
        .confirmationDialog("この項目を却下しますか？", isPresented: Binding(get: { rejection != nil }, set: { if !$0 { rejection = nil } }), titleVisibility: .visible) {
            Button("却下する", role: .destructive) {
                if let rejection { model.perform(rejection.action, for: rejection.item) }
                rejection = nil
            }
            Button("キャンセル", role: .cancel) { rejection = nil }
        } message: {
            Text(rejection?.item.title ?? "この操作は取り消せません。")
        }
    }
}

private struct PendingNativeAction {
    let item: NativeActionItem
    let action: NativeWorkflowAction
}

private struct NativeActionRow: View {
    let item: NativeActionItem
    let isPending: Bool
    let onOpen: () -> Void
    let onPerform: (NativeWorkflowAction) -> Void

    var body: some View {
        HStack(spacing: 14) {
            itemIcon
            Button(action: onOpen) { itemDetails }
                .buttonStyle(.plain)
            if let modelDate {
                Text(modelDate)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.tertiary)
                    .frame(width: 112, alignment: .trailing)
            }
            actionButtons
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color(nsColor: .separatorColor).opacity(0.45), lineWidth: 0.7))
        .opacity(isPending ? 0.6 : 1)
    }

    private var modelDate: String? {
        guard let value = item.dueAt ?? item.updatedAt else { return nil }
        return NativeDate.short(value)
    }

    private var itemIcon: some View {
        let tint: Color = item.priority == "urgent" ? .red : .accentColor
        return Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 34, height: 34)
            .background(tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 9))
    }

    private var itemDetails: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                Text(kindTitle).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                if let statusTitle {
                    Text(statusTitle)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                }
                if let priority = item.priority, ["urgent", "due-soon", "new"].contains(priority) {
                    priorityBadge(priority)
                }
            }
            Text(item.title).font(.system(size: 14, weight: .semibold)).foregroundStyle(.primary).lineLimit(1)
            Text(metaText).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func priorityBadge(_ priority: String) -> some View {
        let text = priority == "urgent" ? "期限超過" : priority == "due-soon" ? "期限間近" : "新着"
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(priority == "urgent" ? Color.red : Color.orange)
    }

    @ViewBuilder
    private var actionButtons: some View {
        ForEach(item.actions ?? []) { action in
            if action.toState == "approved" || action.toState == "done" {
                Button(action.label) { onPerform(action) }.buttonStyle(.borderedProminent).controlSize(.small).disabled(isPending)
            } else {
                Button(action.label) { onPerform(action) }.buttonStyle(.bordered).controlSize(.small).disabled(isPending)
            }
        }
    }

    private var metaText: String {
        [item.project, item.subject, item.detail].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var statusTitle: String? {
        switch item.status {
        case "open": "未着手"
        case "doing": "進行中"
        case "pending": "承認待ち"
        case "new": "新着"
        case "reviewing": "確認中"
        case "in-review": "審査中"
        case "done": "完了"
        case "approved": "承認済み"
        case "rejected": "却下"
        default: nil
        }
    }

    private var kindTitle: String {
        switch item.kind {
        case "task": "タスク"
        case "document": "記事"
        case "application": "応募"
        case "approval": "承認"
        default: "運営"
        }
    }

    private var symbol: String {
        switch item.kind {
        case "task": "checkmark.circle"
        case "document": "doc.text"
        case "application": "person.crop.rectangle.stack"
        case "approval": "person.badge.clock"
        default: "circle.grid.2x2"
        }
    }
}

private struct NativeMetric: View {
    let title: String
    let value: Int
    let symbol: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: symbol).font(.system(size: 17, weight: .medium)).foregroundStyle(Color.accentColor)
                    .frame(width: 34, height: 34).background(Color.accentColor.opacity(0.11), in: RoundedRectangle(cornerRadius: 9))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.caption).foregroundStyle(.secondary)
                    Text(value, format: .number).font(.system(size: 22, weight: .semibold, design: .rounded)).monospacedDigit()
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}

private struct NativeSectionHeading: View {
    let title: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(_ title: String, actionTitle: String?, action: (() -> Void)?) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        HStack {
            Text(title).font(.system(size: 16, weight: .semibold))
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action).buttonStyle(.link).font(.callout)
            }
        }
    }
}

private struct NativeEmptyState: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 6) {
            Text(title).font(.system(size: 14, weight: .semibold))
            Text(subtitle).font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 98)
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct NativeLoadingState: View {
    let title: String
    var body: some View {
        VStack(spacing: 10) {
            ProgressView()
            Text(title).font(.callout).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }
}

private struct NativeErrorState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle").font(.system(size: 24)).foregroundStyle(.orange)
            Text("読み込めませんでした").font(.headline)
            Text(message).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center).textSelection(.enabled)
            Button("再読み込み", action: retry).buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding(24)
    }
}

private enum NativeDate {
    static func parse(_ value: String) -> Date? {
        ISO8601DateFormatter().date(from: value) ?? fractional.date(from: value)
    }

    static func short(_ value: String) -> String {
        guard let date = parse(value) else { return value }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    static func day(_ value: String?) -> String {
        guard let value, let date = parse(value) else { return "—" }
        return date.formatted(.dateTime.day())
    }

    static func month(_ value: String?) -> String {
        guard let value, let date = parse(value) else { return "" }
        return date.formatted(.dateTime.month(.abbreviated))
    }

    static func time(_ value: String) -> String {
        guard let date = parse(value) else { return value }
        return date.formatted(.dateTime.hour().minute())
    }

    private static let fractional = ISO8601DateFormatter().then { $0.formatOptions.insert(.withFractionalSeconds) }
}

private extension ISO8601DateFormatter {
    func then(_ configure: (ISO8601DateFormatter) -> Void) -> ISO8601DateFormatter {
        configure(self)
        return self
    }
}

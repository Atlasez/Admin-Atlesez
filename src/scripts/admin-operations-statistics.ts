import { readAdminApiJson } from "../lib/admin-api";
import type { readOperationsInsights } from "../lib/admin-operations-insights";
type Insights = Awaited<ReturnType<typeof readOperationsInsights>>;

import { createAdminLoadRetry } from "./admin-load-retry";
type Member = {
  subjectAssignments?: string[];
  workflowSubjects?: string[];
  role?: string;
  university?: string;
  year?: string;
  country?: string;
};
type GenreData = {
  members?: Member[];
  overviews?: Array<{
    subject?: string;
    progress?: string;
    updated_at?: string;
  }>;
  error?: string;
};
const initialize = () => {
  const root = document.querySelector<HTMLElement>(
    "[data-operations-statistics]",
  );
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "true";
  const esc = (value: unknown) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character] ?? character,
    );
  const setMetric = (name: string, value: string | number) => {
    const element = root.querySelector<HTMLElement>(`[data-metric="${name}"]`);
    if (element) element.textContent = String(value);
  };
  let loading = false;
  let loadVersion = 0;
  const renderBreakdown = (
    members: Member[],
    key: "year" | "university" | "country",
  ) => {
    const list = root.querySelector<HTMLElement>(`[data-breakdown="${key}"]`);
    if (!list) return;
    const counts = new Map<string, number>();
    members.forEach((member) => {
      const value = String(member[key] ?? "").trim() || "未登録";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    const rows = [...counts.entries()].sort(
      (left, right) =>
        right[1] - left[1] || left[0].localeCompare(right[0], "ja"),
    );
    list.innerHTML = rows.length
      ? rows
          .map(
            ([label, count]) =>
              `<li><span title="${esc(label)}">${esc(label)}</span><strong>${count}人</strong></li>`,
          )
          .join("")
      : '<li class="loading-state">データがありません。</li>';
  };
  const load = async () => {
    if (loading) return;
    loading = true;
    const version = ++loadVersion;
    retry.begin();
    try {
      const [genre, insights] = await Promise.all([
        fetch("/api/admin/genre-overviews?project=atlas", {
          credentials: "same-origin",
          cache: "no-store",
        }).then(async (response) => {
          const data = await readAdminApiJson<GenreData>(
            response,
            "分野統計を読み込めませんでした。",
          );
          if (!response.ok)
            throw new Error(data.error ?? "分野統計を読み込めませんでした。");
          return data;
        }),
        fetch("/api/admin/operations-statistics?project=atlas", {
          credentials: "same-origin",
          cache: "no-store",
        }).then(async (response) => {
          const data = await readAdminApiJson<Insights & { error?: string }>(
            response,
            "運営統計を読み込めませんでした。",
          );
          if (!response.ok)
            throw new Error(data.error ?? "運営統計を読み込めませんでした。");
          if (!data.tasks || !data.approval || !Array.isArray(data.workload))
            throw new Error("統計の形式を確認できませんでした。");
          return data;
        }),
      ]);
      if (version !== loadVersion) return;
      const members = genre.members ?? [];
      const assigned = new Set(
        members.flatMap((member) => [
          ...(member.subjectAssignments ?? []),
          ...(member.workflowSubjects ?? []),
        ]),
      );
      const overview = genre.overviews ?? [];
      setMetric("members", members.length);
      setMetric("assigned", assigned.size);
      setMetric("tasks", insights.tasks.unfinished);
      setMetric("reports", insights.reports);
      setMetric("events", insights.events);
      setMetric("overdue", insights.tasks.overdue);
      setMetric("approval", insights.approval.total);
      setMetric(
        "waiting-days",
        insights.approval.oldestDays === null
          ? "—"
          : `${Math.floor(insights.approval.oldestDays)}日`,
      );
      root.querySelector<HTMLElement>("[data-waiting-unknown]")!.textContent =
        `開始日時未記録: ${insights.approval.unknownStart ?? 0}件`;
      root.querySelector<HTMLElement>("[data-workload]")!.innerHTML =
        `<table><thead><tr><th>担当</th><th>未完了</th><th>進行中</th><th>期限超過</th></tr></thead><tbody>${insights.workload.map((row) => `<tr><td>${esc(row.name)}</td><td>${row.unfinished}</td><td>${row.doing}</td><td>${row.overdue}</td></tr>`).join("") || '<tr><td colspan="4">未完了タスクはありません。</td></tr>'}</tbody></table>`;
      root.querySelector<HTMLElement>("[data-waiting]")!.innerHTML =
        insights.waiting
          .map(
            (row) =>
              `<li><a href="/admin/editor/?document=${encodeURIComponent(row.id)}">${esc(row.title)}</a><span>${row.stage === "subject-coordinator" ? "分野統括" : "プロジェクトリーダー"} / ${row.startedAt ? `${Math.max(0, Math.floor((Date.parse(insights.generatedAt) - Date.parse(row.startedAt)) / 86400000))}日` : "開始日時未記録"}</span></li>`,
          )
          .join("") || "<li>公開審査待ちはありません。</li>";
      setMetric(
        "leads",
        new Set(members.flatMap((member) => member.workflowSubjects ?? []))
          .size,
      );
      renderBreakdown(members, "year");
      renderBreakdown(members, "university");
      renderBreakdown(members, "country");
      const updates = [
        ...overview.map((item) => item.updated_at ?? ""),
        insights.tasks.lastUpdatedAt ?? "",
      ]
        .filter(Boolean)
        .sort()
        .reverse();
      setMetric(
        "last-update",
        updates[0] ? new Date(updates[0]).toLocaleDateString("ja-JP") : "—",
      );
      const table = root.querySelector<HTMLElement>("[data-subject-table]")!;
      table.innerHTML = `<table><thead><tr><th>分野</th><th>担当</th><th>進捗メモ</th><th>更新</th></tr></thead><tbody>${overview.length ? overview.map((item) => `<tr><td>${esc(item.subject)}</td><td class="${item.progress ? "status-ok" : "status-none"}">${item.progress ? "登録済み" : "未登録"}</td><td><div class="status-bar"><span style="width:${item.progress ? "100" : "8"}%"></span></div></td><td class="muted">${item.updated_at ? esc(new Date(item.updated_at).toLocaleDateString("ja-JP")) : "—"}</td></tr>`).join("") : '<tr><td colspan="4" class="loading-state">分野データがありません。</td></tr>'}</tbody></table>`;
      const updated = root.querySelector<HTMLElement>("[data-updated]");
      if (updated) updated.textContent = `${overview.length}分野を集計`;
      if (
        !members.length &&
        !overview.length &&
        !insights.tasks.total &&
        !insights.reports &&
        !insights.events &&
        !insights.approval.total
      )
        retry.empty("表示できる統計データはありません。");
      else retry.success();
    } catch (error) {
      const message = root.querySelector<HTMLOutputElement>("[data-message]");
      if (message)
        message.value =
          error instanceof Error
            ? error.message
            : "統計を読み込めませんでした。";
      retry.fail(error);
    } finally {
      if (version === loadVersion) loading = false;
    }
  };
  const retry = createAdminLoadRetry(
    root,
    () => load(),
    "統計を読み込めませんでした。",
  );
  void load();
};
document.addEventListener("astro:page-load", initialize);
initialize();

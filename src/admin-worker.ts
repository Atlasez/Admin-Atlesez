import {
  EDITORIAL_ASSET_ID_PATTERN,
  EDITORIAL_IMAGE_TYPES,
  MAX_EDITORIAL_ASSET_BYTES,
  editorialAssetIsReferenced,
  editorialAssetIdsIn,
  editorialLatexNamesIn,
  replaceEditorialAssetMarkers,
  replaceEditorialLatexReferences,
  sanitizeEditorialFilename,
  sanitizeEditorialLatexName,
  uniqueEditorialFilename,
  type EditorialImageType,
} from "./lib/editorial-media";

import { isAdminPagePath } from "./lib/admin-routes";
import {
  canAccess,
  getUserStage,
  stageHome,
  type UserArea,
  type UserStage,
} from "./lib/user-stage";
import {
  isValidTimeZone,
  localDateTimeToEpoch,
  reminderBeforeDue,
} from "./lib/date-time";
import { dispatchDueTaskReminders } from "./lib/task-reminder-delivery";
import { dispatchApplicationEmails } from "./lib/application-email-delivery";
import { normalizeArticleReferences } from "./lib/article-references.mjs";
import { tikzPackageHelp } from "./lib/tikz-policy.mjs";
// ローカルWrangler開発時だけ同一Workerのexportをフォールバックとして使う。
// Preview/本番は外部の専用Worker bindingを必ず経由する。
export { EditorialCollaborationRoom } from "./editorial-collaboration-worker";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

type DurableObjectId = object;
interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
  exports?: { EditorialCollaborationRoom?: DurableObjectNamespace };
};
interface Env {
  ASSETS: Fetcher;
  REPORTS: D1Database;
  EDITORIAL_COLLABORATION?: DurableObjectNamespace;
  /** 既定は cloudflare-access。Google移行時のみ google-oauth を設定する。 */
  ADMIN_AUTH_MODE?: string;
  /** Google OAuth後に必ず戻す運営サイトの固定URL。Preview URLでは認証を完結させない。 */
  ADMIN_PUBLIC_ORIGIN?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  /** localhostの開発時だけ使う、ログイン不要のテスト用メールアドレス。 */
  ADMIN_LOCAL_EMAIL?: string;
  /** 承認済み原稿の公開PRを作成するためのGitHub Fine-grained token（Secret）。 */
  GITHUB_PUBLISH_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  /** 分野別・全体進捗の通知用。値はCloudflare Secretにのみ保存する。 */
  DISCORD_ATLAS_WEBHOOK_URL?: string;
  DISCORD_PROGRESS_WEBHOOK_URL?: string;
  /** Discordの既存ロールを読み取り、運営サイト側の対応表を更新するBot。 */
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_GUILD_NAME?: string;
  /** 応募者本人のDiscord OAuth2連携。client secretと暗号化鍵はSecretに保存する。 */
  DISCORD_OAUTH_CLIENT_ID?: string;
  DISCORD_OAUTH_CLIENT_SECRET?: string;
  DISCORD_OAUTH_REDIRECT_URI?: string;
  DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY?: string;
  /** 分野別通知を集約する、全体進捗チャンネルのID。 */
  DISCORD_PROGRESS_CHANNEL_ID?: string;
  /** 任意。設定された自分用メールリマインダーの配信に使う。 */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** 応募通知の追加送信先。未設定時は運営事務局の運営内運営をD1から取得する。 */
  APPLICATION_OPERATIONS_EMAILS?: string;
  /** Cloudflare Turnstile。応募フォーム公開時は必須にする。 */
  TURNSTILE_SECRET_KEY?: string;
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  /** Atlasez.com の公開Workerから応募を受け取るための共有Secret。 */
  PUBLIC_APPLICATION_INGEST_TOKEN?: string;
  /** 学習サイトの問題報告を受け取るための共有Secret。 */
  ARTICLE_REPORT_INGEST_TOKEN?: string;
  /** 公開Workerが持つ匿名の都道府県集計を管理画面から読む。 */
  PUBLIC_ANALYTICS_ORIGIN?: string;
  /** Node/WASM TikZ組版サービスのURL。管理Workerからのみ呼び出す。 */
  TIKZ_RENDERER_URL?: string;
  /** TikZ組版サービス間の共有Bearer token（Cloudflare Secret）。 */
  TIKZ_RENDERER_TOKEN?: string;
}

type ReportStatus = "new" | "reviewing" | "resolved";
type AdminUpdatePayload = { status?: unknown; adminNote?: unknown };
const ALLOWED_REPORT_TYPES = new Set([
  "error",
  "suggestion",
  "reference",
  "other",
]);
type PermissionPayload = { email?: unknown; subject?: unknown };
type EditorialDocumentStatus = "draft" | "in-review" | "on-hold" | "approved";
type EditorialPublicationReviewStage = "subject-coordinator" | "project-leader";
type EditorialWorkflowRole = EditorialPublicationReviewStage;
type EditorialLockedRange = { start: number; end: number; text: string };
type PersonalMathPreset = {
  id: string;
  label: string;
  group?: string;
  macros: Record<string, string>;
};
type PersonalReference = {
  id: string;
  title: string;
  authors?: string;
  year?: string;
  publisher?: string;
  url?: string;
  note?: string;
};
type LatexEngine =
  "uplatex" | "pdflatex" | "xelatex" | "lualatex" | "mathjax" | "katex";
type EditorialDocument = {
  id: string;
  source_article_id: string | null;
  subject: string;
  category: string;
  locale: string;
  slug: string;
  title: string;
  summary: string;
  concept_id: string;
  body: string;
  writing_memo: string;
  latex_engine: LatexEngine;
  status: EditorialDocumentStatus;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_expires_at: string | null;
  scheduled_publish_at: string | null;
  scheduled_publish_claimed_at: string | null;
  publication_review_stage: EditorialPublicationReviewStage | null;
  publication_review_round: number;
  publication_pr_number: number | null;
  publication_pr_url: string | null;
  publication_branch: string | null;
  publication_action: "publish" | "unpublish" | null;
  publication_requested_at: string | null;
  locked_ranges: string;
  article_references: string;
};
type EditorialAsset = {
  id: string;
  document_id: string;
  filename: string;
  media_type: EditorialImageType;
  bytes: number;
  data: ArrayBuffer | Uint8Array;
  alt_text: string;
  latex_name: string;
  created_by: string;
  created_at: string;
};
type EditorialComment = {
  id: string;
  document_id: string;
  parent_comment_id: string | null;
  body: string;
  created_by: string;
  created_at: string;
  selection_start: number | null;
  selection_end: number | null;
  selection_text: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  acknowledged_by_emails?: string[];
  unacknowledged_by_emails?: string[];
  selections?: EditorialCommentSelection[];
  tags?: string[];
};
type EditorialCommentSelection = {
  id: string;
  comment_id: string;
  position: number;
  selection_start: number | null;
  selection_end: number | null;
  selection_text: string;
};
type EditorialDocumentPayload = {
  sourceArticleId?: unknown;
  subject?: unknown;
  category?: unknown;
  locale?: unknown;
  slug?: unknown;
  title?: unknown;
  summary?: unknown;
  conceptId?: unknown;
  body?: unknown;
  latexEngine?: unknown;
  status?: unknown;
  writingMemo?: unknown;
  lockedRanges?: unknown;
  references?: unknown;
};
type EditorialCommentPayload = {
  body?: unknown;
  selectionStart?: unknown;
  selectionEnd?: unknown;
  selectionText?: unknown;
  parentCommentId?: unknown;
  selections?: unknown;
  tags?: unknown;
};
type ArticleReport = {
  id: string;
  article_title: string;
  article_url: string;
  article_id: string | null;
  subject: string;
  category: string;
  report_type: string;
  details: string;
  contact: string | null;
  locale: string;
  status: ReportStatus;
  admin_note: string;
  created_at: string;
  updated_at: string;
};
type ArticleReportIngestPayload = {
  reportId?: unknown;
  articleTitle?: unknown;
  articleUrl?: unknown;
  articleId?: unknown;
  subject?: unknown;
  category?: unknown;
  reportType?: unknown;
  details?: unknown;
  contact?: unknown;
  locale?: unknown;
  reporterHash?: unknown;
  contentHash?: unknown;
  createdAt?: unknown;
};
type ArticleAnalytics = {
  article_id: string;
  article_title: string;
  subject: string;
  category: string;
  views: number;
  engaged_reads: number;
  completed_reads: number;
};
type ArticleAnalyticsRegion = {
  region_code: string;
  views: number;
  engaged_reads: number;
  completed_reads: number;
};
type SearchConsoleCountryStat = {
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
type SearchConsoleQueryStat = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

const REPORT_STATUSES = new Set<ReportStatus>(["new", "reviewing", "resolved"]);
const EDITORIAL_DOCUMENT_STATUSES = new Set<EditorialDocumentStatus>([
  "draft",
  "in-review",
  "on-hold",
  "approved",
]);
const LATEX_ENGINES = new Set<LatexEngine>([
  "uplatex",
  "pdflatex",
  "xelatex",
  "lualatex",
  "mathjax",
  "katex",
]);
const MAX_ADMIN_NOTE_LENGTH = 4_000;
const MAX_EDITORIAL_BODY_LENGTH = 240_000;
const MAX_EDITORIAL_COMMENT_LENGTH = 8_000;
const EDITORIAL_COMMENT_TAGS = new Set([
  "定義不足",
  "根拠確認",
  "表記修正",
  "要相談",
  "例・図の追加",
  "数式確認",
  "構成改善",
  "翻訳・用語",
  "アクセシビリティ",
  "公開前確認",
]);
const MAX_PERSONAL_WORKSPACE_NOTE_LENGTH = 12_000;
const MAX_PERSONAL_MATH_PRESETS = 40;
const MAX_PERSONAL_MATH_MACROS = 40;
const MAX_PERSONAL_MATH_LABEL_LENGTH = 80;
const MAX_PERSONAL_MATH_REPLACEMENT_LENGTH = 2_000;
const MAX_PERSONAL_REFERENCES = 200;
const MAX_OPERATION_TEXT_LENGTH = 8_000;
const ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_SLUG = /^[a-z0-9-]+$/;
const MEMBER_UNIVERSITIES = [
  "北海道大学",
  "東北大学",
  "東京大学",
  "東京科学大学",
  "東京都立大学",
  "早稲田大学",
  "横浜国立大学",
  "静岡大学",
  "新潟大学",
  "岐阜大学",
  "立命館大学",
  "京都大学",
  "大阪大学",
  "大阪公立大学",
  "神戸大学",
  "広島大学",
  "九州大学",
  "長崎大学",
  "東洋大学",
  "UCL",
  "国立台湾大学",
  "山口大学",
  "慶應義塾大学",
  "東京理科大学",
  "中央大学",
  "名古屋大学",
  "筑波大学",
  "名古屋市立大学",
  "名城大学",
  "Korea university, School of biomedical engineering",
  "立教大学",
  "Swarthmore College",
  "北見工業大学",
  "ZEN大学",
] as const;
const MEMBER_YEARS = [
  "中1",
  "中2",
  "中3",
  "高1",
  "高2",
  "高3",
  "高専1",
  "高専2",
  "高専3",
  "高専4",
  "高専5",
  "B1",
  "B2",
  "B3",
  "B4",
  "M1",
  "M2",
  "D1",
  "D2",
  "D3",
  "教職員・研究者",
  "社会人",
  "その他",
] as const;
const MEMBER_AFFILIATION_TYPES = [
  "中学校",
  "高等学校",
  "高等専門学校",
  "大学",
  "大学院",
  "研究機関・教育機関",
  "社会人",
  "その他",
] as const;
const MEMBER_INTERESTS = [
  "漢字",
  "古文",
  "漢文",
  "地理",
  "日本史",
  "世界史",
  "哲学",
  "考古学",
  "数学",
  "物理",
  "化学",
  "地質",
  "気象",
  "海洋",
  "天文",
  "生物",
  "情報",
  "水産学",
  "建築",
  "薬学",
  "中国語（普通話）",
  "台湾華語",
  "言語学",
  "ページデザイン",
] as const;
const APPLICATION_SUBJECT_LABELS: Record<string, string> = {
  kanji: "漢字",
  kobun: "古文",
  kanbun: "漢文",
  geography: "地理",
  "japanese-history": "日本史",
  "world-history": "世界史",
  philosophy: "哲学",
  archaeology: "考古学",
  mathematics: "数学",
  physics: "物理",
  chemistry: "化学",
  geology: "地質",
  meteorology: "気象",
  oceanography: "海洋",
  astronomy: "天文",
  biology: "生物",
  informatics: "情報",
  "fisheries-science": "水産学",
  architecture: "建築",
  pharmacy: "薬学",
  chinese: "中国語（普通話）",
  "taiwanese-mandarin": "台湾華語",
  linguistics: "言語学",
  other: "その他",
};
const APPLICATION_FORM_LABELS: Record<string, string> = {
  atlas: "学習サイト「アトラス」",
  "thinking-cafe": "考えるカフェ",
  "seminar-platform": "ゼミプラットフォーム",
  "student-council-exchange": "日本生徒会協会",
  secretariat: "運営事務局",
};
const APPLICATION_FORM_SLUGS = new Set(Object.keys(APPLICATION_FORM_LABELS));
const canonicalApplicationProjectSlug = (value: string) =>
  value === "semi-platform" ? "seminar-platform" : value;
// 同じ学校・職場のネットワークから応募が集中しても、正当な応募を止めない。
// 公開取込は共有トークン経由のため控えめにし、ログイン済みの応募は認証と
// メールアドレス単位の重複確認を前提に、まとまった応募を受け付ける。
const APPLICATION_RATE_LIMITS = {
  publicWorker: 20,
  authenticated: 50,
} as const;
const APPLICATION_AFFILIATION_ALIASES: Record<string, string> = {
  中学: "中学校",
  中学生: "中学校",
  高校: "高等学校",
  高校生: "高等学校",
  高専: "高等専門学校",
  大学生: "大学",
  大学院生: "大学院",
  研究機関: "研究機関・教育機関",
  教育機関: "研究機関・教育機関",
};
const APPLICATION_GRADE_ALIASES: Record<string, string> = {
  中学1年: "中1",
  中学2年: "中2",
  中学3年: "中3",
  高校1年: "高1",
  高校2年: "高2",
  高校3年: "高3",
  大学1年: "B1",
  大学2年: "B2",
  大学3年: "B3",
  大学4年: "B4",
  学部1年: "B1",
  学部2年: "B2",
  学部3年: "B3",
  学部4年: "B4",
  修士1年: "M1",
  修士2年: "M2",
  博士1年: "D1",
  博士2年: "D2",
  博士3年: "D3",
};
const APPLICATION_GRADES_BY_AFFILIATION: Record<string, readonly string[]> = {
  中学校: ["中1", "中2", "中3", "その他"],
  高等学校: ["高1", "高2", "高3", "その他"],
  高等専門学校: ["高専1", "高専2", "高専3", "高専4", "高専5", "その他"],
  大学: ["B1", "B2", "B3", "B4", "教職員・研究者", "その他"],
  大学院: ["M1", "M2", "D1", "D2", "D3", "教職員・研究者", "その他"],
  "研究機関・教育機関": ["教職員・研究者", "その他"],
  社会人: ["社会人", "その他"],
  その他: MEMBER_YEARS,
};
// Cookie/table names are retained for existing Google OAuth sessions.  The
// session now proves Google identity only; admin access still requires the
// separate report_admin_permissions check below.
const ADMIN_SESSION_COOKIE = "atlasez_admin_session";
const GOOGLE_STATE_COOKIE = "atlasez_google_oauth_state";
const GOOGLE_LINK_STATE_COOKIE = "atlasez_google_account_link_state";
const SEARCH_CONSOLE_STATE_COOKIE = "atlasez_search_console_oauth_state";
const DISCORD_OAUTH_SCOPE = "identify guilds.join";
const DISCORD_OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;
const DISCORD_PROVISION_MAX_ATTEMPTS = 6;
const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1_000;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const normalizedText = (value: unknown, maximum: number) =>
  text(value, maximum)
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAffiliationType = (value: unknown) => {
  const normalized = normalizedText(value, 80);
  return APPLICATION_AFFILIATION_ALIASES[normalized] ?? normalized;
};

const normalizeGrade = (value: unknown) => {
  const normalized = normalizedText(value, 80);
  const compact = normalized.replace(/\s+/g, "");
  return APPLICATION_GRADE_ALIASES[compact] ?? compact.toUpperCase();
};

const normalizeInstitution = (value: unknown) => {
  const normalized = normalizedText(value, 160);
  const known = MEMBER_UNIVERSITIES.find(
    (institution) =>
      institution.normalize("NFKC").toLocaleLowerCase("en-US") ===
      normalized.toLocaleLowerCase("en-US"),
  );
  return known ?? normalized;
};

const validTimeZone = isValidTimeZone;

// datetime-localは選択したタイムゾーンの壁時計時刻として保存する。
// Workerの実行環境のタイムゾーンに依存しないよう、ここでepochへ変換する。
const wallTimeToEpoch = (value: string, timeZone: string) => {
  try {
    return localDateTimeToEpoch(value, timeZone);
  } catch {
    return Number.NaN;
  }
};

type TaskReminderRowInput = {
  remindAt: string;
  timezone: string;
  label: string;
  repeat: string;
  relativeKind: "absolute" | "before" | "due_day_hourly";
  relativeAmount: number | null;
  relativeUnit: "days" | "hours" | null;
  relativeStart: string | null;
};

const hourlyReminderWallTimes = (dueAt: string, start: string) => {
  const dueMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(dueAt);
  const startMatch = /^(\d{2}):(\d{2})$/.exec(start);
  if (!dueMatch || !startMatch) return [] as string[];
  const dueMinutes = Number(dueMatch[2]) * 60 + Number(dueMatch[3]);
  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  if (startMinutes > dueMinutes) return [] as string[];
  const times: string[] = [];
  for (let minutes = startMinutes; minutes <= dueMinutes; minutes += 60) {
    times.push(
      `${dueMatch[1]}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
  }
  return times;
};

const reminderInputRows = (
  payload: unknown[],
  dueAt: string,
  dueTimezone: string,
): { rows?: TaskReminderRowInput[]; error?: string } => {
  const rows: TaskReminderRowInput[] = [];
  for (const value of payload.slice(0, 100)) {
    const item =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
    const kind = text(item.kind ?? item.relativeKind, 30) || "absolute";
    if (kind === "before") {
      const amount = Number(item.amount);
      const unit = text(item.unit, 12);
      if (
        !dueAt ||
        !validTimeZone(dueTimezone) ||
        !Number.isInteger(amount) ||
        amount < 1 ||
        (unit !== "days" && unit !== "hours") ||
        amount > (unit === "days" ? 365 : 8_760)
      )
        return {
          error:
            "期限基準のリマインダーには、期限・正しい数量・単位が必要です。",
        };
      let remindAt = "";
      try {
        remindAt = reminderBeforeDue(dueAt, dueTimezone, amount, unit);
      } catch {
        return {
          error:
            "期限またはリマインダー日時が存在しない時刻です。タイムゾーンを確認してください。",
        };
      }
      if (wallTimeToEpoch(remindAt, dueTimezone) <= Date.now())
        return { error: "リマインダー日時は現在より後にしてください。" };
      rows.push({
        remindAt,
        timezone: dueTimezone,
        label: `${amount}${unit === "days" ? "日前" : "時間前"}`,
        repeat: "none",
        relativeKind: "before",
        relativeAmount: amount,
        relativeUnit: unit,
        relativeStart: null,
      });
      continue;
    }
    if (kind === "due_day_hourly") {
      if (!dueAt || !validTimeZone(dueTimezone))
        return { error: "当日毎時のリマインダーには期限が必要です。" };
      const start = text(item.start, 5) || "09:00";
      if (
        !/^\d{2}:\d{2}$/.test(start) ||
        Number(start.slice(0, 2)) > 23 ||
        Number(start.slice(3, 5)) > 59
      )
        return { error: "当日毎時の開始時刻を確認してください。" };
      const times = hourlyReminderWallTimes(dueAt, start);
      if (!times.length)
        return { error: "当日毎時の開始時刻は期限時刻より前にしてください。" };
      const futureTimes = times.filter(
        (remindAt) => wallTimeToEpoch(remindAt, dueTimezone) > Date.now(),
      );
      if (!futureTimes.length)
        return { error: "未来のリマインダー日時を設定してください。" };
      rows.push(
        ...futureTimes.map((remindAt) => ({
          remindAt,
          timezone: dueTimezone,
          label: `期限当日の毎時（${start}から）`,
          repeat: "none",
          relativeKind: "due_day_hourly" as const,
          relativeAmount: null,
          relativeUnit: null,
          relativeStart: start,
        })),
      );
      continue;
    }
    const remindAt = text(item.remindAt, 32);
    if (!remindAt) continue;
    const timezone = text(item.timezone, 80) || dueTimezone;
    const epoch = wallTimeToEpoch(remindAt, timezone);
    if (!Number.isFinite(epoch))
      return {
        error:
          "リマインダー日時が存在しない時刻です。タイムゾーンを確認してください。",
      };
    if (epoch <= Date.now())
      return { error: "リマインダー日時は現在より後にしてください。" };
    rows.push({
      remindAt,
      timezone,
      label: text(item.label, 120),
      repeat: text(item.repeat, 12) || "none",
      relativeKind: "absolute",
      relativeAmount: null,
      relativeUnit: null,
      relativeStart: null,
    });
  }
  return { rows };
};

type AdminScope = {
  email: string;
  subjects: string[];
  allSubjects: boolean;
  isManager: boolean;
  coordinatorSubjects?: string[];
  isProjectLeader?: boolean;
};

type CurrentUserStage = {
  email: string;
  stage: UserStage;
  applicationStatus: string | null;
  projectSlug: string | null;
  baseProfileComplete: boolean;
  projectProfileComplete: boolean;
  tutorialStep: number;
  atlasWritingPracticeStep: number;
  atlasWritingPracticeComplete: boolean;
};

type ApplicantProfile = {
  email: string;
  family_name: string;
  given_name: string;
  middle_name: string;
  nickname: string;
  family_name_kana: string;
  given_name_kana: string;
  form_language: "ja" | "en";
  affiliation_email: string;
  affiliation_type: string;
  institution: string;
  grade: string;
  country: string;
  timezone: string;
  birth_date: string;
  residence_city: string;
  current_organizations: string;
  referral_source: string;
};

const cookieValue = (request: Request, name: string) => {
  const prefix = `${name}=`;
  for (const item of (request.headers.get("cookie") ?? "").split(";")) {
    const value = item.trim();
    if (value.startsWith(prefix)) {
      try {
        return decodeURIComponent(value.slice(prefix.length));
      } catch {
        return "";
      }
    }
  }
  return "";
};

const cookie = (name: string, value: string, maxAge: number, path = "/") =>
  `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;

const hash = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const base64Encode = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64Decode = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const discordOAuthConfigured = (env: Env) =>
  Boolean(
    env.DISCORD_OAUTH_CLIENT_ID?.trim() &&
      env.DISCORD_OAUTH_CLIENT_SECRET?.trim() &&
      env.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY?.trim(),
  );

const discordOAuthCallbackUrl = (request: Request, env: Env) =>
  (env.DISCORD_OAUTH_REDIRECT_URI?.trim() ||
    `${adminPublicOrigin(request, env)}/auth/discord/callback`).replace(/\/$/, "");

const discordEncryptionKey = async (env: Env) => {
  const raw = env.DISCORD_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (!raw) throw new Error("Discord OAuth暗号化鍵が未設定です。");
  let bytes: Uint8Array;
  try {
    bytes = /^[0-9a-f]{64}$/i.test(raw)
      ? Uint8Array.from(raw.match(/.{2}/g) ?? [], (pair) => parseInt(pair, 16))
      : base64Decode(raw);
  } catch {
    throw new Error("Discord OAuth暗号化鍵の形式が正しくありません。");
  }
  if (bytes.byteLength !== 32)
    throw new Error("Discord OAuth暗号化鍵は32バイト必要です。");
  return crypto.subtle.importKey("raw", bytes as unknown as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const encryptDiscordSecret = async (env: Env, value: string) => {
  if (!value) return "";
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await discordEncryptionKey(env),
    new TextEncoder().encode(value),
  );
  return `${base64Encode(nonce)}.${base64Encode(new Uint8Array(encrypted))}`;
};

const decryptDiscordSecret = async (env: Env, value: string) => {
  if (!value) return "";
  const [nonceValue, encryptedValue] = value.split(".");
  if (!nonceValue || !encryptedValue) throw new Error("Discord OAuth token is invalid");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64Decode(nonceValue) },
    await discordEncryptionKey(env),
    base64Decode(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
};

const authMode = (env: Env) => env.ADMIN_AUTH_MODE ?? "cloudflare-access";
const googleOAuthEnabled = (env: Env) =>
  authMode(env) === "google-oauth" || authMode(env) === "hybrid-preview";
const cloudflareAccessEnabled = (env: Env) =>
  authMode(env) === "cloudflare-access" || authMode(env) === "hybrid-preview";
const localDevelopmentEnabled = (request: Request, env: Env) => {
  const hostname = new URL(request.url).hostname;
  return (
    authMode(env) === "local" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1")
  );
};

class GoogleIdentityConflictError extends Error {}

async function accountById(
  env: Env,
  accountId: string,
): Promise<{ id: string; canonical_email: string } | null> {
  return env.REPORTS.prepare(
    "SELECT id,canonical_email FROM atlasez_accounts WHERE id = ?",
  )
    .bind(accountId)
    .first();
}

async function accountByEmail(
  env: Env,
  email: string,
): Promise<{ id: string; canonical_email: string } | null> {
  return env.REPORTS.prepare(
    `SELECT a.id,a.canonical_email
     FROM atlasez_accounts a
     LEFT JOIN atlasez_google_identities g ON g.account_id=a.id
     WHERE lower(a.canonical_email)=lower(?) OR lower(g.email)=lower(?)
     LIMIT 1`,
  )
    .bind(email, email)
    .first();
}

async function ensureAtlasezAccount(
  env: Env,
  email: string,
): Promise<{ id: string; canonical_email: string }> {
  const existing = await accountByEmail(env, email);
  if (existing) return existing;
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO atlasez_accounts (id,canonical_email,created_at,updated_at)
     VALUES (?,?,?,?)`,
  )
    .bind(crypto.randomUUID(), email.toLowerCase(), now, now)
    .run();
  const created = await accountByEmail(env, email);
  if (!created) throw new Error("Atlasezアカウントを作成できませんでした。");
  return created;
}

async function googleIdentityBySubject(
  env: Env,
  subject: string,
): Promise<{
  google_subject: string;
  account_id: string;
  email: string;
} | null> {
  return env.REPORTS.prepare(
    "SELECT google_subject,account_id,email FROM atlasez_google_identities WHERE google_subject=?",
  )
    .bind(subject)
    .first();
}

async function googleIdentityByEmail(
  env: Env,
  email: string,
): Promise<{
  google_subject: string;
  account_id: string;
  email: string;
} | null> {
  return env.REPORTS.prepare(
    "SELECT google_subject,account_id,email FROM atlasez_google_identities WHERE lower(email)=lower(?)",
  )
    .bind(email)
    .first();
}

async function resolveGoogleAccount(
  env: Env,
  subject: string,
  email: string,
  expectedAccountId?: string,
): Promise<{ id: string; canonical_email: string }> {
  const [bySubject, byEmail] = await Promise.all([
    googleIdentityBySubject(env, subject),
    googleIdentityByEmail(env, email),
  ]);
  if (bySubject && byEmail && bySubject.account_id !== byEmail.account_id)
    throw new GoogleIdentityConflictError("Google IDが別アカウントに属しています。");
  if (
    expectedAccountId &&
    (bySubject?.account_id !== undefined && bySubject.account_id !== expectedAccountId ||
      byEmail?.account_id !== undefined && byEmail.account_id !== expectedAccountId)
  )
    throw new GoogleIdentityConflictError(
      "このGoogleアカウントは別のAtlasezアカウントに連携済みです。",
    );
  if (expectedAccountId && (bySubject || byEmail))
    throw new GoogleIdentityConflictError("このGoogleアカウントはすでに連携されています。");
  if (!expectedAccountId && byEmail && !bySubject)
    throw new GoogleIdentityConflictError(
      "このGoogleメールアドレスは別のGoogle IDに連携済みです。",
    );
  const account = expectedAccountId
    ? await accountById(env, expectedAccountId)
    : bySubject
      ? await accountById(env, bySubject.account_id)
      : await ensureAtlasezAccount(env, email);
  if (!account) throw new Error("Atlasezアカウントが見つかりません。");
  const now = new Date().toISOString();
  if (bySubject) {
    await env.REPORTS.prepare(
      "UPDATE atlasez_google_identities SET email=?,last_login_at=? WHERE google_subject=?",
    )
      .bind(email, now, subject)
      .run();
    return account;
  }
  await env.REPORTS.prepare(
    `INSERT INTO atlasez_google_identities
       (google_subject,account_id,email,created_at,last_login_at)
     VALUES (?,?,?,?,?)`,
  )
    .bind(subject, account.id, email, now, now)
    .run();
  return account;
}

/**
 * 認証方式の境界。現在はCloudflare Access、将来は同じ権限表のまま
 * Google OAuthのセッションへ切り替えられる。
 */
async function getAuthenticatedEmail(
  request: Request,
  env: Env,
): Promise<string | Response> {
  const mode = authMode(env);
  if (localDevelopmentEnabled(request, env))
    return env.ADMIN_LOCAL_EMAIL ?? "local-editor@atlasez.test";
  if (!cloudflareAccessEnabled(env) && !googleOAuthEnabled(env))
    return json(
      { error: "管理画面の認証方式が正しく設定されていません。" },
      500,
    );

  // 併用プレビューでは、Googleログイン済みならそちらを優先する。
  // まだGoogleでログインしていない運営者は、従来どおりAccessのメールを使う。
  if (googleOAuthEnabled(env)) {
    const token = cookieValue(request, ADMIN_SESSION_COOKIE);
    if (token) {
      const session = await env.REPORTS.prepare(
        `SELECT s.email,a.canonical_email
         FROM admin_auth_sessions s
         LEFT JOIN atlasez_accounts a ON a.id=s.account_id
         WHERE s.session_hash = ? AND s.expires_at > ?`,
      )
        .bind(await hash(token), new Date().toISOString())
        .first<{ email: string; canonical_email: string | null }>();
      if (session?.email) return session.canonical_email ?? session.email;
    }
  }

  if (cloudflareAccessEnabled(env)) {
    const email = request.headers
      .get(ACCESS_EMAIL_HEADER)
      ?.trim()
      .toLowerCase();
    if (email) return email;
  }
  return json(
    {
      error:
        mode === "google-oauth"
          ? "ログインが必要です。"
          : "Cloudflare Access の認証情報を確認できませんでした。",
    },
    401,
  );
}

async function getAuthenticatedAtlasezAccount(
  request: Request,
  env: Env,
): Promise<{ id: string; canonical_email: string } | Response> {
  const identity = await getAuthenticatedEmail(request, env);
  if (isResponse(identity)) return identity;
  try {
    return await ensureAtlasezAccount(env, identity);
  } catch {
    return json({ error: "Atlasezアカウントを確認できませんでした。" }, 500);
  }
}

async function getAdminScope(
  request: Request,
  env: Env,
): Promise<AdminScope | Response> {
  const identity = await getAuthenticatedEmail(request, env);
  if (identity instanceof Response) return identity;
  const email = identity;
  // ローカル開発では本番D1の権限表をコピーしなくても動作確認できる。
  if (localDevelopmentEnabled(request, env))
    return {
      email,
      subjects: ["*"],
      allSubjects: true,
      isManager: true,
      coordinatorSubjects: ["*"],
      isProjectLeader: true,
    };
  const [result, workflowRoles] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT subject FROM report_admin_permissions WHERE email = ?",
    )
      .bind(email)
      .all<{ subject: string }>(),
    env.REPORTS.prepare(
      "SELECT role, subject FROM editorial_workflow_roles WHERE lower(email) = lower(?)",
    )
      .bind(email)
      .all<{ role: EditorialWorkflowRole; subject: string }>(),
  ]);
  const grantedSubjects = result.results
    .map((permission) => permission.subject)
    .filter(Boolean);
  if (!grantedSubjects.length && !(workflowRoles.results ?? []).length)
    return json({ error: "この管理画面の閲覧権限が設定されていません。" }, 403);
  const allSubjects = grantedSubjects.includes("*");
  // `*` は全分野管理者の権限であって、その人自身の執筆担当分野ではない。
  // 通常の原稿一覧・作業状況は担当分野だけに限定する。
  const subjects = grantedSubjects.filter((subject) => subject !== "*");
  return {
    email,
    subjects,
    allSubjects,
    isManager: allSubjects,
    coordinatorSubjects: (workflowRoles.results ?? [])
      .filter((role) => role.role === "subject-coordinator")
      .map((role) => role.subject),
    isProjectLeader: (workflowRoles.results ?? []).some(
      (role) => role.role === "project-leader",
    ),
  };
}

const isResponse = <T>(value: T | Response): value is Response =>
  value instanceof Response;

async function getUserStageForEmail(
  email: string,
  env: Env,
  localAdmin = false,
): Promise<Omit<CurrentUserStage, "email">> {
  const [application, permission, profile] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT status,project_slug FROM atlasez_member_applications
       WHERE lower(email) = lower(?) ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(email)
      .first<{ status: string; project_slug: string }>(),
    env.REPORTS.prepare(
      "SELECT 1 AS found FROM report_admin_permissions WHERE email = ? LIMIT 1",
    )
      .bind(email)
      .first<{ found: number }>(),
    env.REPORTS.prepare(
      "SELECT display_name,bio FROM editorial_member_profiles WHERE lower(email) = lower(?)",
    )
      .bind(email)
      .first<{ display_name: string; bio: string }>(),
  ]);
  const applicationStatus = application?.status ?? null;
  const projectSlug = application?.project_slug ?? null;
  const projectId = projectSlug ? onboardingProjectId(projectSlug) : null;
  const projectProfile =
    applicationStatus === "accepted" && projectId
      ? await env.REPORTS.prepare(
          "SELECT internal_bio FROM editorial_project_member_profiles WHERE project_id=? AND lower(email)=lower(?)",
        )
          .bind(projectId, email)
          .first<{ internal_bio: string }>()
      : null;
  const tutorial =
    applicationStatus === "accepted" && projectId
      ? await env.REPORTS.prepare(
          `SELECT tutorial_step,tutorial_completed_at,atlas_writing_practice_step,atlas_writing_practice_completed_at
           FROM atlasez_member_onboarding_progress
           WHERE project_id=? AND lower(email)=lower(?)`,
        )
          .bind(projectId, email)
          .first<{
            tutorial_step: number;
            tutorial_completed_at: string | null;
            atlas_writing_practice_step: number | null;
            atlas_writing_practice_completed_at: string | null;
          }>()
      : null;
  const baseProfileComplete = Boolean(profile?.bio?.trim());
  const projectProfileComplete = Boolean(projectProfile?.internal_bio?.trim());
  return {
    applicationStatus,
    projectSlug,
    baseProfileComplete,
    projectProfileComplete,
    tutorialStep: Math.max(0, Number(tutorial?.tutorial_step ?? 0)),
    atlasWritingPracticeStep: Math.max(
      0,
      Math.min(
        4,
        Number(
          tutorial?.atlas_writing_practice_step ??
            (tutorial?.atlas_writing_practice_completed_at ? 4 : 0),
        ),
      ),
    ),
    atlasWritingPracticeComplete: Boolean(
      tutorial?.atlas_writing_practice_completed_at,
    ),
    stage: getUserStage({
      applicationStatus,
      profileComplete: baseProfileComplete,
      projectProfileComplete,
      tutorialComplete: Boolean(tutorial?.tutorial_completed_at),
      isAdmin: localAdmin || Boolean(permission),
    }),
  };
}

/** 共通プロフィールだけは、受入済みメンバー本人にも確認させる。 */
async function getMemberProfileScope(
  request: Request,
  env: Env,
): Promise<AdminScope | Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  const applicantProfile = await getApplicantProfile(env, current.email);
  if (
    (current.applicationStatus === "accepted" && current.baseProfileComplete) ||
    applicantBasicProfileComplete(applicantProfile)
  )
    return {
      email: current.email,
      subjects: [],
      allSubjects: false,
      isManager: false,
    };
  return getAdminScope(request, env);
}

async function getCurrentUserStage(
  request: Request,
  env: Env,
): Promise<CurrentUserStage | Response> {
  const identity = await getAuthenticatedEmail(request, env);
  if (isResponse(identity)) return identity;
  return {
    email: identity,
    ...(await getUserStageForEmail(
      identity,
      env,
      localDevelopmentEnabled(request, env),
    )),
  };
}

const applicantProfileFromRow = (
  row: (Partial<ApplicantProfile> & { email?: string }) | null | undefined,
): ApplicantProfile | null => {
  if (!row?.email) return null;
  return {
    email: String(row.email),
    family_name: String(row.family_name ?? ""),
    given_name: String(row.given_name ?? ""),
    middle_name: String(row.middle_name ?? ""),
    nickname: String(row.nickname ?? ""),
    family_name_kana: String(row.family_name_kana ?? ""),
    given_name_kana: String(row.given_name_kana ?? ""),
    form_language: row.form_language === "en" ? "en" : "ja",
    affiliation_email: String(row.affiliation_email ?? ""),
    affiliation_type: String(row.affiliation_type ?? ""),
    institution: String(row.institution ?? ""),
    grade: String(row.grade ?? ""),
    country: String(row.country ?? ""),
    timezone: String(row.timezone ?? "Asia/Tokyo"),
    birth_date: String(row.birth_date ?? ""),
    residence_city: String(row.residence_city ?? ""),
    current_organizations: String(row.current_organizations ?? ""),
    referral_source: String(row.referral_source ?? ""),
  };
};

/** 応募フォームの基本情報が揃っているか。紹介元はプロジェクトごとの項目なので含めない。 */
const applicantBasicProfileComplete = (profile: ApplicantProfile | null) =>
  Boolean(
    profile &&
    [
      profile.family_name,
      profile.given_name,
      ...(profile.form_language === "en"
        ? []
        : [profile.family_name_kana, profile.given_name_kana]),
      profile.affiliation_email,
      profile.affiliation_type,
      profile.institution,
      profile.grade,
      profile.country,
      profile.timezone,
      profile.birth_date,
      profile.residence_city,
    ].every((value) => value.trim()),
  );

/** 保存済みの基本情報。旧応募しかない参加者は、最新の応募から後方互換で復元する。 */
async function getApplicantProfile(
  env: Env,
  email: string,
): Promise<ApplicantProfile | null> {
  const stored = await env.REPORTS.prepare(
    `SELECT email,family_name,given_name,middle_name,nickname,family_name_kana,given_name_kana,
            form_language,affiliation_email,affiliation_type,institution,grade,country,timezone,birth_date,
            residence_city,current_organizations,referral_source
     FROM atlasez_applicant_profiles WHERE lower(email)=lower(?)`,
  )
    .bind(email)
    .first<ApplicantProfile>();
  if (stored) return applicantProfileFromRow(stored);
  const legacy = await env.REPORTS.prepare(
    `SELECT email,family_name,given_name,middle_name,nickname,family_name_kana,given_name_kana,
            form_language,affiliation_email,affiliation_type,institution,grade,country,timezone,birth_date,
            residence_city,current_organizations,referral_source
     FROM atlasez_member_applications
     WHERE lower(email)=lower(?) ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(email)
    .first<ApplicantProfile>();
  return applicantProfileFromRow(legacy);
}

async function getApplicationProfile(
  request: Request,
  env: Env,
): Promise<Response> {
  const identity = await getAuthenticatedEmail(request, env);
  if (isResponse(identity)) return identity;
  const current = await getUserStageForEmail(
    identity,
    env,
    localDevelopmentEnabled(request, env),
  );
  const profile = await getApplicantProfile(env, identity);
  return json({
    email: identity,
    profile,
    hasProfile: Boolean(profile),
    stage: current.stage,
    applicationStatus: current.applicationStatus,
    projectSlug: current.projectSlug,
  });
}

async function saveApplicationProfile(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const identity = await getAuthenticatedEmail(request, env);
  if (isResponse(identity)) return identity;
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const formLanguage = text(payload.formLanguage, 2) === "en" ? "en" : "ja";
  const familyName = normalizedText(payload.familyName, 80);
  const givenName = normalizedText(payload.givenName, 80);
  const middleName = normalizedText(payload.middleName, 80);
  const nickname = normalizedText(payload.nickname, 120);
  const familyNameKana = normalizedText(payload.familyNameKana, 80);
  const givenNameKana = normalizedText(payload.givenNameKana, 80);
  const affiliationEmail = normalizedText(
    payload.affiliationEmail,
    320,
  ).toLowerCase();
  const affiliationType = normalizeAffiliationType(payload.affiliationType);
  const institution = normalizeInstitution(payload.institution);
  const grade = normalizeGrade(payload.grade);
  const country = normalizedText(payload.country, 100);
  const timezone = normalizedText(payload.timezone, 80);
  const birthDate = text(payload.birthDate, 10);
  const residenceCity = normalizedText(payload.residenceCity, 160);
  const currentOrganizations = text(payload.currentOrganizations, 1_000);
  const referralSource = text(payload.referralSource, 500);
  if (
    !familyName ||
    !givenName ||
    !EMAIL_PATTERN.test(affiliationEmail) ||
    !affiliationType ||
    !institution ||
    !grade ||
    !country ||
    !validTimeZone(timezone) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    !residenceCity ||
    (formLanguage === "ja" && (!familyNameKana || !givenNameKana))
  )
    return json({ error: "基本情報をすべて入力してください。" }, 400);
  if (
    !(MEMBER_AFFILIATION_TYPES as readonly string[]).includes(affiliationType)
  )
    return json({ error: "所属区分を一覧から選択してください。" }, 400);
  if (
    !(MEMBER_YEARS as readonly string[]).includes(grade) ||
    !(APPLICATION_GRADES_BY_AFFILIATION[affiliationType] ?? []).includes(grade)
  )
    return json(
      { error: "所属区分に対応する学年・立場を選択してください。" },
      400,
    );
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO atlasez_applicant_profiles
      (email,family_name,given_name,middle_name,nickname,family_name_kana,given_name_kana,form_language,
       affiliation_email,affiliation_type,institution,grade,country,timezone,birth_date,residence_city,
       current_organizations,referral_source,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(email) DO UPDATE SET
       family_name=excluded.family_name,given_name=excluded.given_name,middle_name=excluded.middle_name,
       nickname=excluded.nickname,
       family_name_kana=excluded.family_name_kana,given_name_kana=excluded.given_name_kana,
       form_language=excluded.form_language,affiliation_type=excluded.affiliation_type,
       affiliation_email=excluded.affiliation_email,
       institution=excluded.institution,grade=excluded.grade,country=excluded.country,
       timezone=excluded.timezone,birth_date=excluded.birth_date,residence_city=excluded.residence_city,
       current_organizations=excluded.current_organizations,
       referral_source=COALESCE(NULLIF(excluded.referral_source,''),atlasez_applicant_profiles.referral_source),
       updated_at=excluded.updated_at`,
  )
    .bind(
      identity,
      familyName,
      givenName,
      middleName,
      nickname,
      familyNameKana,
      givenNameKana,
      formLanguage,
      affiliationEmail,
      affiliationType,
      institution,
      grade,
      country,
      timezone,
      birthDate,
      residenceCity,
      currentOrganizations,
      referralSource,
      now,
      now,
    )
    .run();
  return json({ ok: true, profile: await getApplicantProfile(env, identity) });
}

async function getGlobalAdminScope(
  request: Request,
  env: Env,
): Promise<AdminScope | Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.allSubjects)
    return json(
      { error: "担当分野の設定は全分野管理者のみ変更できます。" },
      403,
    );
  return scope;
}

const isSameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

const hasArticleReportIngestToken = (request: Request, env: Env) => {
  const expected = env.ARTICLE_REPORT_INGEST_TOKEN?.trim();
  const received = request.headers
    .get("x-atlasez-article-report-token")
    ?.trim();
  return Boolean(
    expected &&
    received &&
    expected.length === received.length &&
    [...expected].every((character, index) => character === received[index]),
  );
};

const isTrustedArticleUrl = (value: string) => {
  try {
    const url = new URL(value);
    const trustedHost =
      (url.protocol === "https:" &&
        (url.hostname === "atlasez.org" ||
          url.hostname === "www.atlasez.org")) ||
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"));
    return trustedHost && url.pathname.startsWith("/atlas/");
  } catch {
    return false;
  }
};

async function ingestArticleReport(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST" || !hasArticleReportIngestToken(request, env))
    return json({ error: "Not found" }, 404);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);

  let payload: ArticleReportIngestPayload;
  try {
    payload = (await request.json()) as ArticleReportIngestPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const reportId = text(payload.reportId, 36);
  const articleTitle = text(payload.articleTitle, 200);
  const articleUrl = text(payload.articleUrl, 2_000);
  const articleId = text(payload.articleId, 200);
  const subject = text(payload.subject, 80);
  const category = text(payload.category, 80);
  const reportType = text(payload.reportType, 40);
  const details = text(payload.details, 6_000);
  const contact = text(payload.contact, 320);
  const locale = text(payload.locale, 16);
  const reporterHash = text(payload.reporterHash, 128);
  const contentHash = text(payload.contentHash, 128);
  if (
    !/^[0-9a-f-]{36}$/i.test(reportId) ||
    !articleTitle ||
    !isTrustedArticleUrl(articleUrl) ||
    !/^[a-z0-9-]+$/.test(subject) ||
    !/^[a-z0-9-]+$/.test(category) ||
    !ALLOWED_REPORT_TYPES.has(reportType) ||
    !details ||
    !/^[a-z]{3}$/.test(locale) ||
    !/^[a-f0-9]{64}$/.test(reporterHash) ||
    !/^[a-f0-9]{64}$/.test(contentHash)
  )
    return json({ error: "問題報告の内容を確認してください。" }, 400);
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
    return json({ error: "連絡先メールアドレスを確認してください。" }, 400);

  const duplicate = await env.REPORTS.prepare(
    "SELECT id FROM article_reports WHERE id = ? OR content_hash = ? LIMIT 1",
  )
    .bind(reportId, contentHash)
    .first<{ id: string }>();
  if (duplicate) return json({ ok: true, duplicate: true }, 200);

  await env.REPORTS.prepare(
    `INSERT INTO article_reports
      (id, article_title, article_url, article_id, subject, category, report_type, details, contact, locale, reporter_hash, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      reportId,
      articleTitle,
      articleUrl,
      articleId || null,
      subject,
      category,
      reportType,
      details,
      contact || null,
      locale,
      reporterHash,
      contentHash,
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true }, 201);
}

async function listArticleReports(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const requested = new URL(request.url).searchParams.get("status") ?? "all";
  const status = REPORT_STATUSES.has(requested as ReportStatus)
    ? (requested as ReportStatus)
    : null;
  if (requested !== "all" && !status)
    return json({ error: "状態を確認してください。" }, 400);
  const select = `SELECT id, article_title, article_url, article_id, subject, category, report_type, details,
      contact, locale, status, admin_note, created_at, updated_at FROM article_reports`;
  const order = ` ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, created_at DESC LIMIT 250`;
  const filters: string[] = [];
  const values: unknown[] = [];
  if (status) {
    filters.push("status = ?");
    values.push(status);
  }
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const statement = env.REPORTS.prepare(`${select}${where}${order}`);
  const result = values.length
    ? await statement.bind(...values).all<ArticleReport>()
    : await statement.all<ArticleReport>();
  // 問題内容は全運営者が確認できるが、送信者の連絡先は全分野管理者だけに開示する。
  return json({
    reports: result.results.map((report) => ({
      ...report,
      contact: scope.isManager ? report.contact : null,
      can_manage: scope.allSubjects || scope.subjects.includes(report.subject),
    })),
  });
}

async function listArticleAnalytics(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isInteger(daysParam)
    ? Math.min(90, Math.max(1, daysParam))
    : 30;
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const result = await env.REPORTS.prepare(
    `SELECT article_id, MAX(article_title) AS article_title, subject, category,
        SUM(views) AS views, SUM(engaged_reads) AS engaged_reads,
        SUM(completed_reads) AS completed_reads
     FROM article_analytics_daily
     WHERE day >= ?
     GROUP BY article_id, subject, category
     ORDER BY completed_reads DESC, engaged_reads DESC, views DESC, article_title ASC
     LIMIT 50`,
  )
    .bind(since)
    .all<ArticleAnalytics>();
  return json({ days, articles: result.results });
}

async function listArticleAnalyticsRegions(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const daysParam = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const days = Number.isInteger(daysParam)
    ? Math.min(90, Math.max(1, daysParam))
    : 30;
  const since = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1_000)
    .toISOString()
    .slice(0, 10);
  const publicOrigin = env.PUBLIC_ANALYTICS_ORIGIN?.trim().replace(/\/+$/, "");
  if (publicOrigin) {
    try {
      const publicUrl = new URL(
        `${publicOrigin}/api/article-analytics-regions`,
      );
      publicUrl.searchParams.set("days", String(days));
      const response = await fetch(publicUrl, {
        headers: { accept: "application/json" },
      });
      if (response.ok) {
        const data = (await response.json()) as {
          regions?: ArticleAnalyticsRegion[];
        };
        return json({
          days,
          country: "JP",
          regions: Array.isArray(data.regions) ? data.regions : [],
        });
      }
    } catch {
      // 公開Workerが一時的に取得できない場合は管理側D1へフォールバックする。
    }
  }
  const result = await env.REPORTS.prepare(
    `SELECT region_code, SUM(views) AS views,
        SUM(engaged_reads) AS engaged_reads,
        SUM(completed_reads) AS completed_reads
     FROM article_analytics_region_daily
     WHERE day >= ? AND country = 'JP'
     GROUP BY region_code
     ORDER BY views DESC, region_code ASC
     LIMIT 47`,
  )
    .bind(since)
    .all<ArticleAnalyticsRegion>();
  return json({ days, country: "JP", regions: result.results });
}

async function listSearchConsoleCountryStats(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const snapshot = await env.REPORTS.prepare(
    `SELECT snapshot_id, start_date, end_date, MAX(fetched_at) AS fetched_at
     FROM search_console_country_snapshots
     GROUP BY snapshot_id, start_date, end_date
     ORDER BY fetched_at DESC LIMIT 1`,
  ).first<{
    snapshot_id: string;
    start_date: string;
    end_date: string;
    fetched_at: string;
  }>();
  if (!snapshot) return json({ snapshot: null, countries: [] });
  const result = await env.REPORTS.prepare(
    `SELECT country, clicks, impressions, ctr, position
     FROM search_console_country_snapshots
     WHERE snapshot_id = ? AND clicks > 0
     ORDER BY clicks DESC, impressions DESC, country ASC`,
  )
    .bind(snapshot.snapshot_id)
    .all<SearchConsoleCountryStat>();
  return json({ snapshot, countries: result.results });
}

async function listSearchConsoleQueryStats(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const snapshot = await env.REPORTS.prepare(
    `SELECT snapshot_id, start_date, end_date, MAX(fetched_at) AS fetched_at
     FROM search_console_query_snapshots
     GROUP BY snapshot_id, start_date, end_date
     ORDER BY fetched_at DESC LIMIT 1`,
  ).first<{
    snapshot_id: string;
    start_date: string;
    end_date: string;
    fetched_at: string;
  }>();
  if (!snapshot) return json({ snapshot: null, queries: [] });
  const result = await env.REPORTS.prepare(
    `SELECT query, clicks, impressions, ctr, position
     FROM search_console_query_snapshots
     WHERE snapshot_id = ? ORDER BY clicks DESC, impressions DESC, query ASC
     LIMIT 100`,
  )
    .bind(snapshot.snapshot_id)
    .all<SearchConsoleQueryStat>();
  return json({ snapshot, queries: result.results });
}

async function updateArticleReport(
  request: Request,
  env: Env,
  reportId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: AdminUpdatePayload;
  try {
    payload = (await request.json()) as AdminUpdatePayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const status = text(payload.status, 20) as ReportStatus;
  if (!REPORT_STATUSES.has(status))
    return json({ error: "対応状況を確認してください。" }, 400);
  const report = await env.REPORTS.prepare(
    "SELECT subject FROM article_reports WHERE id = ?",
  )
    .bind(reportId)
    .first<{ subject: string }>();
  if (!report) return json({ error: "報告が見つかりません。" }, 404);
  if (!scope.allSubjects && !scope.subjects.includes(report.subject))
    return json({ error: "この分野の報告を更新する権限がありません。" }, 403);
  await env.REPORTS.prepare(
    `UPDATE article_reports SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(
      status,
      text(payload.adminNote, MAX_ADMIN_NOTE_LENGTH),
      new Date().toISOString(),
      reportId,
    )
    .run();
  return json({ ok: true });
}

async function listReportAdminPermissions(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const result = await env.REPORTS.prepare(
    `SELECT p.email,
      GROUP_CONCAT(DISTINCT p.subject) AS subjects,
      COALESCE(NULLIF(TRIM(m.display_name), ''), '表示名未設定') AS display_name,
      COALESCE(m.university, '') AS university,
      COALESCE(m.year, '') AS year,
      COALESCE(m.interests, '') AS interests,
      COALESCE(m.avatar_url, '') AS avatar_url,
      COALESCE(d.discord_user_id, '') AS discord_user_id
     FROM report_admin_permissions p
     LEFT JOIN editorial_member_profiles m ON m.email = p.email
     LEFT JOIN atlasez_member_discord_accounts d ON d.email = p.email
     GROUP BY p.email, m.display_name, m.university, m.year, m.interests
     ORDER BY display_name, p.email`,
  ).all<{
    email: string;
    subjects: string;
    display_name: string;
    university: string;
    year: string;
    interests: string;
    avatar_url: string;
    discord_user_id: string;
  }>();
  const workflowRoles = await env.REPORTS.prepare(
    `SELECT r.email, r.role, r.subject,
       COALESCE(NULLIF(TRIM(m.display_name), ''), '表示名未設定') AS display_name
     FROM editorial_workflow_roles r
     LEFT JOIN editorial_member_profiles m ON lower(m.email)=lower(r.email)
     ORDER BY r.role, r.subject, display_name, r.email`,
  ).all<{ email: string; role: EditorialWorkflowRole; subject: string; display_name: string }>();
  return json({ permissions: result.results, workflowRoles: workflowRoles.results });
}

async function createEditorialWorkflowRole(request: Request, env: Env): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  const payload = (await request.json().catch(() => null)) as { email?: unknown; role?: unknown; subject?: unknown } | null;
  const email = text(payload?.email, 320).toLowerCase();
  const role = text(payload?.role, 40) as EditorialWorkflowRole;
  const subject = text(payload?.subject, 80);
  if (!EMAIL_PATTERN.test(email) || role !== "subject-coordinator" || !SUBJECT_SLUG.test(subject))
    return json({ error: "メールアドレス・統括する分野を確認してください。" }, 400);
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    "INSERT OR IGNORE INTO editorial_workflow_roles (email,role,subject,created_at,created_by) VALUES (?,?,?,?,?)",
  ).bind(email, role, subject, now, scope.email).run();
  return json({ ok: true }, 201);
}

async function deleteEditorialWorkflowRole(request: Request, env: Env): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
  const role = url.searchParams.get("role")?.trim() ?? "";
  const subject = url.searchParams.get("subject")?.trim() ?? "";
  if (!EMAIL_PATTERN.test(email) || role !== "subject-coordinator" || !SUBJECT_SLUG.test(subject))
    return json({ error: "削除対象を確認してください。" }, 400);
  await env.REPORTS.prepare(
    "DELETE FROM editorial_workflow_roles WHERE lower(email)=lower(?) AND role=? AND subject=?",
  ).bind(email, role, subject).run();
  return json({ ok: true });
}

async function updateMemberDiscordUserId(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { email?: unknown; discordUserId?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase();
  const discordUserId = text(payload.discordUserId, 32);
  if (!EMAIL_PATTERN.test(email))
    return json({ error: "メールアドレスを確認してください。" }, 400);
  if (discordUserId && !/^\d{15,22}$/.test(discordUserId))
    return json(
      { error: "DiscordユーザーIDは15〜22桁の数字で入力してください。" },
      400,
    );
  const participant = await env.REPORTS.prepare(
    "SELECT 1 AS found FROM report_admin_permissions WHERE email = ? LIMIT 1",
  )
    .bind(email)
    .first<{ found: number }>();
  if (!participant)
    return json(
      { error: "参加者一覧に登録されていないメールアドレスです。" },
      404,
    );
  if (discordUserId) {
    if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
      return json(
        { error: "本人確認に必要なDiscord Bot設定が未完了です。" },
        503,
      );
    const duplicate = await env.REPORTS.prepare(
      "SELECT email FROM atlasez_member_discord_accounts WHERE discord_user_id = ? AND email != ?",
    )
      .bind(discordUserId, email)
      .first<{ email: string }>();
    if (duplicate)
      return json(
        { error: "このDiscordユーザーIDは別の参加者に登録済みです。" },
        409,
      );
    const member = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}`,
      {
        headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
      },
    );
    if (!member.ok)
      return json(
        {
          error:
            `Discord「${env.DISCORD_GUILD_NAME?.trim() || "設定対象サーバー"}」で対象ユーザーを確認できません。サーバー参加とユーザーIDを確認してください。`,
        },
        400,
      );
  }
  const now = new Date().toISOString();
  if (discordUserId)
    await env.REPORTS.prepare(
      "INSERT INTO atlasez_member_discord_accounts (email,discord_user_id,updated_at) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET discord_user_id=excluded.discord_user_id,updated_at=excluded.updated_at",
    )
      .bind(email, discordUserId, now)
      .run();
  else
    await env.REPORTS.prepare(
      "DELETE FROM atlasez_member_discord_accounts WHERE email = ?",
    )
      .bind(email)
      .run();
  if (!discordUserId)
    return json({
      ok: true,
      discordUserId,
      provisioning: { status: "skipped", applied: 0, warnings: [] },
    });
  const [profile, permissions] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT university,year,interests,affiliation_type FROM editorial_member_profiles WHERE email=?",
    )
      .bind(email)
      .first<{
        university: string;
        year: string;
        interests: string;
        affiliation_type: string;
      }>(),
    env.REPORTS.prepare(
      "SELECT subject FROM report_admin_permissions WHERE email=?",
    )
      .bind(email)
      .all<{ subject: string }>(),
  ]);
  const provisioning = await provisionApplicationDiscordRoles(
    env,
    email,
    (permissions.results ?? []).map((item) => item.subject),
    {
      institution: profile?.university ?? "",
      year: profile?.year ?? "",
      affiliationType: profile?.affiliation_type ?? "",
      interests: (profile?.interests ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  );
  await env.REPORTS.prepare(
    `UPDATE atlasez_member_applications
     SET provisioning_status = ?, provisioning_error = ?, provisioned_at = ?, updated_at = ?
     WHERE email = ? AND status = 'accepted'`,
  )
    .bind(
      provisioning.status,
      provisioning.warnings.join("\n").slice(0, 2_000),
      provisioning.status === "synced" ? now : null,
      now,
      email,
    )
    .run();
  return json(
    { ok: provisioning.status !== "failed", discordUserId, provisioning },
    provisioning.status === "failed" ? 502 : 200,
  );
}

async function syncDiscordMemberRoles(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { email?: unknown };
  try {
    payload = (await request.json()) as { email?: unknown };
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase();
  if (!EMAIL_PATTERN.test(email))
    return json({ error: "メールアドレスを確認してください。" }, 400);
  const [profile, permissions] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT university, year, interests, affiliation_type FROM editorial_member_profiles WHERE email = ?",
    )
      .bind(email)
      .first<{
        university: string;
        year: string;
        interests: string;
        affiliation_type: string;
      }>(),
    env.REPORTS.prepare(
      "SELECT subject FROM report_admin_permissions WHERE email = ?",
    )
      .bind(email)
      .all<{ subject: string }>(),
  ]);
  if (!profile && !permissions.results?.length)
    return json({ error: "参加者が見つかりません。" }, 404);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return json(
      { error: "Discord BotトークンまたはサーバーIDが未設定です。" },
      503,
    );
  const account = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(email)
    .first<{ discord_user_id: string }>();
  if (!account)
    return json(
      {
        error:
          "この参加者のDiscordユーザーIDが未登録です。運営者・担当管理で本人確認後に登録してください。",
      },
      400,
    );
  const provisioning = await provisionApplicationDiscordRoles(
    env,
    email,
    (permissions.results ?? []).map((item) => item.subject),
    {
      institution: profile?.university ?? "",
      year: profile?.year ?? "",
      affiliationType: profile?.affiliation_type ?? "",
      interests: (profile?.interests ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    },
  );
  if (provisioning.status === "failed")
    return json({ error: provisioning.warnings.join(" "), provisioning }, 502);
  const memberResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}`,
    { headers: { authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
  );
  if (!memberResponse.ok)
    return json(
      {
        error:
          "Discordサーバー内に対象ユーザーが見つかりません。ユーザーIDとBotのサーバー参加状況を確認してください。",
      },
      502,
    );
  const member = (await memberResponse.json()) as { roles?: string[] };
  return json({
    ok: true,
    discordUserId: account.discord_user_id,
    roleCount: member.roles?.length ?? 0,
    provisioning,
  });
}

async function provisionDiscordAttributeRoles(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return json(
      { error: "Discord BotトークンまたはサーバーIDが未設定です。" },
      503,
    );
  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "content-type": "application/json",
  };
  const guildTarget = await verifyDiscordGuildTarget(env, headers);
  if (!guildTarget.ok) return json({ error: guildTarget.message }, 502);
  const rolesResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`,
    { headers },
  );
  if (!rolesResponse.ok)
    return json(
      {
        error:
          "Discordロール一覧を取得できません。Botが対象サーバーのロール一覧を読み取れることを確認してください。",
      },
      502,
    );
  const existing = (await rolesResponse.json()) as Array<{
    id: string;
    name: string;
  }>;
  const definitions: Array<{ type: string; value: string }> = [
    { type: "manager", value: "運営内運営" },
    ...MEMBER_AFFILIATION_TYPES.map((value) => ({
      type: "affiliation",
      value,
    })),
    ...MEMBER_UNIVERSITIES.map((value) => ({ type: "university", value })),
    ...MEMBER_YEARS.map((value) => ({ type: "year", value })),
    ...MEMBER_INTERESTS.map((value) => ({ type: "interest", value })),
  ];
  const matched: string[] = [];
  const missing: string[] = [];
  for (const definition of definitions) {
    const current = existing.find(
      (role) => role.name.trim() === definition.value.trim(),
    );
    const roleId = current?.id;
    if (!roleId) {
      missing.push(definition.value);
      continue;
    }
    matched.push(definition.value);
    if (definition.type === "manager")
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_role_mappings (project_id,subject,discord_role_id) VALUES ('atlas','__manager__',?) ON CONFLICT(project_id,subject) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(roleId)
        .run();
    else if (definition.type === "affiliation")
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_role_mappings (project_id,subject,discord_role_id) VALUES ('atlas',?,?) ON CONFLICT(project_id,subject) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(`__affiliation__${definition.value}`, roleId)
        .run();
    else
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_attribute_role_mappings (attribute_type,attribute_value,discord_role_id) VALUES (?,?,?) ON CONFLICT(attribute_type,attribute_value) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(definition.type, definition.value, roleId)
        .run();
  }
  return json({
    ok: true,
    guildName:
      guildTarget.name || env.DISCORD_GUILD_NAME || "設定対象サーバー",
    matched: matched.length,
    missing,
    unknownDiscordRoles: existing
      .map((role) => role.name.trim())
      .filter((name) => name && !definitions.some((definition) => definition.value === name)),
    total: definitions.length,
  });
}

async function updateMemberAttributes(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    email?: unknown;
    university?: unknown;
    year?: unknown;
    interests?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase(),
    university = normalizeInstitution(payload.university),
    year = normalizeGrade(payload.year);
  const interests = [
    ...new Set(
      Array.isArray(payload.interests)
        ? payload.interests
            .map((v) => normalizedText(v, 80))
            .filter((v) => (MEMBER_INTERESTS as readonly string[]).includes(v))
        : [],
    ),
  ];
  if (
    !EMAIL_PATTERN.test(email) ||
    /[<>]/.test(university) ||
    (year && !(MEMBER_YEARS as readonly string[]).includes(year))
  )
    return json(
      { error: "所属機関・学年・メールアドレスを確認してください。" },
      400,
    );
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_member_profiles (email, university, year, interests, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET university=excluded.university, year=excluded.year, interests=excluded.interests, updated_at=excluded.updated_at`,
  )
    .bind(email, university, year, interests.join(","), now)
    .run();
  return json({ ok: true });
}

async function createReportAdminPermission(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: PermissionPayload;
  try {
    payload = (await request.json()) as PermissionPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const email = text(payload.email, 320).toLowerCase();
  const subject = text(payload.subject, 80);
  if (
    !EMAIL_PATTERN.test(email) ||
    (subject !== "*" && !SUBJECT_SLUG.test(subject))
  )
    return json({ error: "メールアドレスと担当分野を確認してください。" }, 400);
  await env.REPORTS.prepare(
    "INSERT OR IGNORE INTO report_admin_permissions (email, subject) VALUES (?, ?)",
  )
    .bind(email, subject)
    .run();
  await ensureAtlasMembership(env, {
    email,
    subjects: subject === "*" ? [] : [subject],
    allSubjects: subject === "*",
    isManager: subject === "*",
  });
  return json({ ok: true }, 201);
}

async function deleteReportAdminPermission(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const subject = (url.searchParams.get("subject") ?? "").trim();
  if (
    !EMAIL_PATTERN.test(email) ||
    (subject !== "*" && !SUBJECT_SLUG.test(subject))
  )
    return json({ error: "対象の権限を確認してください。" }, 400);
  if (email === scope.email && subject === "*")
    return json({ error: "自分自身の全分野権限は削除できません。" }, 400);
  await env.REPORTS.prepare(
    "DELETE FROM report_admin_permissions WHERE email = ? AND subject = ?",
  )
    .bind(email, subject)
    .run();
  return json({ ok: true });
}

const editorialDocumentSelect = `SELECT id, source_article_id, subject, category, locale, slug,
  title, summary, concept_id, body, writing_memo, latex_engine, status, created_by, updated_by, created_at, updated_at, reviewed_at, published_at, archived_at, archived_by, archive_expires_at, scheduled_publish_at, scheduled_publish_claimed_at, publication_review_stage, publication_review_round, publication_pr_number, publication_pr_url, publication_branch, publication_action, publication_requested_at, locked_ranges, article_references
  FROM editorial_documents`;

const canEditSubject = (scope: AdminScope, subject: string) =>
  scope.allSubjects || scope.subjects.includes(subject);

const canReviewDocument = (
  scope: AdminScope,
  subject: string,
  status: EditorialDocumentStatus,
) =>
  canEditSubject(scope, subject) || canCoordinateSubject(scope, subject) || (scope.isProjectLeader && status === "in-review") || (scope.isManager && status === "in-review");

const canCoordinateSubject = (scope: AdminScope, subject: string) =>
  Boolean(scope.allSubjects || scope.coordinatorSubjects?.includes("*") || scope.coordinatorSubjects?.includes(subject));

async function tikzRendererPackages(
  request: Request,
  env: Env,
): Promise<Response> {
  void request;
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  return json(tikzPackageHelp());
}

async function renderEditorialTikz(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const rendererUrl = env.TIKZ_RENDERER_URL?.trim();
  if (!rendererUrl)
    return json(
      {
        error:
          "TikZ組版サービスが未設定です。管理者がTIKZ_RENDERER_URLを設定してください。",
      },
      503,
    );
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 64_000)
    return json({ error: "TikZリクエストが大きすぎます。" }, 413);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "TikZリクエストを読み取れませんでした。" }, 400);
  }
  if (!payload || typeof payload !== "object")
    return json({ error: "TikZリクエストが不正です。" }, 400);
  try {
    const url = new URL(rendererUrl);
    if (!/^https?:$/i.test(url.protocol)) throw new Error("invalid protocol");
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(env.TIKZ_RENDERER_TOKEN
          ? { authorization: `Bearer ${env.TIKZ_RENDERER_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    const body = await upstream.text();
    let responsePayload: unknown;
    try {
      responsePayload = JSON.parse(body);
    } catch {
      responsePayload = { error: "TikZ組版サービスの応答が不正です。" };
    }
    if (!upstream.ok) {
      const error =
        responsePayload &&
        typeof responsePayload === "object" &&
        "error" in responsePayload
          ? String(responsePayload.error)
          : "TikZをSVGに変換できませんでした。";
      return json(
        { error },
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      );
    }
    return json(responsePayload);
  } catch {
    return json({ error: "TikZ組版サービスに接続できませんでした。" }, 502);
  }
}

const editorialAssetResponse = (
  asset: Pick<
    EditorialAsset,
    | "id"
    | "filename"
    | "media_type"
    | "bytes"
    | "alt_text"
    | "latex_name"
    | "created_at"
  >,
) => ({
  id: asset.id,
  filename: asset.filename,
  mediaType: asset.media_type,
  bytes: asset.bytes,
  alt: asset.alt_text,
  latexName: asset.latex_name || sanitizeEditorialLatexName("", asset.filename),
  createdAt: asset.created_at,
  marker: `asset://${asset.id}`,
});

const imageSignatureMatches = (
  bytes: Uint8Array,
  mediaType: EditorialImageType,
) => {
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (mediaType === "image/png")
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mediaType === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mediaType === "image/gif")
    return (
      new TextDecoder().decode(bytes.slice(0, 6)) === "GIF87a" ||
      new TextDecoder().decode(bytes.slice(0, 6)) === "GIF89a"
    );
  if (mediaType === "image/svg+xml") {
    const source = new TextDecoder()
      .decode(bytes)
      .replace(/^\uFEFF/, "")
      .trimStart();
    if (!/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(source)) return false;
    return !/<(?:script|foreignObject|iframe|object|embed)\b|<!DOCTYPE\b|<!ENTITY\b|\bon[a-z][a-z0-9_-]*\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i.test(
      source,
    );
  }
  return (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  );
};

const editorialAssetDocument = async (
  request: Request,
  env: Env,
  documentId: string,
) => {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    "SELECT id, subject, status, created_by FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<
      Pick<EditorialDocument, "id" | "subject" | "status" | "created_by">
    >();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この原稿の素材を扱う権限がありません。" }, 403);
  return { scope, document };
};

async function listEditorialAssets(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const access = await editorialAssetDocument(request, env, documentId);
  if (access instanceof Response) return access;
  const result = await env.REPORTS.prepare(
    `SELECT id, filename, media_type, bytes, alt_text, latex_name, created_at
     FROM editorial_assets WHERE document_id = ? ORDER BY created_at ASC`,
  )
    .bind(documentId)
    .all<
      Pick<
        EditorialAsset,
        | "id"
        | "filename"
        | "media_type"
        | "bytes"
        | "alt_text"
        | "latex_name"
        | "created_at"
      >
    >();
  return json({ assets: result.results.map(editorialAssetResponse) });
}

async function uploadEditorialAsset(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const access = await editorialAssetDocument(request, env, documentId);
  if (access instanceof Response) return access;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    !access.scope.isManager &&
    access.document.created_by !== access.scope.email
  )
    return json({ error: "素材を追加できるのは原稿の作成者本人です。" }, 403);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_EDITORIAL_ASSET_BYTES + 32_000)
    return json({ error: "画像は1.5MB以下にしてください。" }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "画像データを読み取れませんでした。" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File))
    return json({ error: "画像ファイルを選択してください。" }, 400);
  const mediaType = file.type as EditorialImageType;
  if (!(mediaType in EDITORIAL_IMAGE_TYPES))
    return json(
      { error: "PNG、JPEG、WebP、GIF、SVGのみ対応しています。" },
      415,
    );
  const data = new Uint8Array(await file.arrayBuffer());
  if (!data.byteLength || data.byteLength > MAX_EDITORIAL_ASSET_BYTES)
    return json({ error: "画像は1.5MB以下にしてください。" }, 413);
  if (!imageSignatureMatches(data, mediaType))
    return json({ error: "画像の形式を確認できませんでした。" }, 415);
  const id = crypto.randomUUID();
  const existingNames = await env.REPORTS.prepare(
    "SELECT id, filename, latex_name FROM editorial_assets WHERE document_id = ?",
  )
    .bind(documentId)
    .all<{ id: string; filename: string; latex_name: string }>();
  const filename = uniqueEditorialFilename(
    sanitizeEditorialFilename(file.name, mediaType),
    existingNames.results.map((asset) => asset.filename),
  );
  const alt = text(form.get("alt"), 180);
  const latexName = sanitizeEditorialLatexName(
    text(form.get("latexName"), 120),
    filename,
  );
  const duplicateName = existingNames.results.some(
    (asset) =>
      (
        asset.latex_name || sanitizeEditorialLatexName("", asset.filename)
      ).toLowerCase() === latexName.toLowerCase(),
  );
  if (duplicateName)
    return json(
      {
        error:
          "この原稿では同じLaTeX名がすでに使われています。別の名前を指定してください。",
      },
      409,
    );
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_assets
      (id, document_id, filename, media_type, bytes, data, alt_text, latex_name, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      documentId,
      filename,
      mediaType,
      data.byteLength,
      data,
      alt,
      latexName,
      access.scope.email,
      now,
    )
    .run();
  return json(
    {
      asset: editorialAssetResponse({
        id,
        filename,
        media_type: mediaType,
        bytes: data.byteLength,
        alt_text: alt,
        latex_name: latexName,
        created_at: now,
      }),
    },
    201,
  );
}

async function deleteEditorialAsset(
  request: Request,
  env: Env,
  assetId: string,
): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const asset = await env.REPORTS.prepare(
    `SELECT a.id, a.document_id, a.filename, a.latex_name, d.subject, d.status, d.created_by, d.body
     FROM editorial_assets a
     JOIN editorial_documents d ON d.id = a.document_id
     WHERE a.id = ?`,
  )
    .bind(assetId)
    .first<
      Pick<EditorialAsset, "id" | "document_id" | "filename" | "latex_name"> & {
        subject: string;
        status: EditorialDocumentStatus;
        created_by: string;
        body: string;
      }
    >();
  if (!asset || !canReviewDocument(scope, asset.subject, asset.status))
    return json({ error: "この素材を扱う権限がありません。" }, 403);
  if (!scope.isManager && asset.created_by !== scope.email)
    return json({ error: "素材を削除できるのは原稿の作成者本人です。" }, 403);
  const latexName =
    asset.latex_name || sanitizeEditorialLatexName("", asset.filename);
  if (
    editorialAssetIsReferenced(asset.body, {
      id: asset.id,
      documentId: asset.document_id,
      filename: asset.filename,
      latexName,
    })
  )
    return json(
      {
        error:
          "本文で使用中の素材は削除できません。本文から画像参照を削除して原稿を保存してから、素材を削除してください。",
      },
      409,
    );
  await env.REPORTS.prepare("DELETE FROM editorial_assets WHERE id = ?")
    .bind(assetId)
    .run();
  return json({ ok: true });
}

async function serveEditorialAsset(
  request: Request,
  env: Env,
  assetId: string,
): Promise<Response> {
  if (!EDITORIAL_ASSET_ID_PATTERN.test(assetId))
    return new Response("Not found", { status: 404 });
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const asset = await env.REPORTS.prepare(
    `SELECT a.id, a.document_id, a.filename, a.media_type, a.bytes, a.data,
            d.subject, d.status
     FROM editorial_assets a
     JOIN editorial_documents d ON d.id = a.document_id
     WHERE a.id = ?`,
  )
    .bind(assetId)
    .first<
      EditorialAsset & { subject: string; status: EditorialDocumentStatus }
    >();
  if (!asset || !canReviewDocument(scope, asset.subject, asset.status))
    return new Response("Not found", { status: 404 });
  // D1 は環境によって BLOB を Uint8Array または ArrayBuffer として返す。
  // D1 の返却型を Response が確実に扱える ArrayBuffer に正規化する。
  let responseBody: ArrayBuffer | null = null;
  try {
    // D1 の BLOB は実行環境により ArrayBuffer/Uint8Array の別Realm型になる
    // ことがあるため、instanceof 判定ではなくバイト列へ変換する。
    if (typeof asset.data === "string") {
      // 一部のD1互換ランタイムはBLOBをbase64文字列で返す。
      const binary = atob(asset.data);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      responseBody = bytes.buffer;
    } else {
      responseBody = new Uint8Array(asset.data as ArrayBufferLike).slice()
        .buffer;
    }
  } catch {
    responseBody = null;
  }
  if (!responseBody?.byteLength)
    return new Response("Not found", { status: 404 });
  return new Response(responseBody, {
    headers: {
      "cache-control": "private, max-age=60",
      "content-length": String(responseBody.byteLength),
      "content-type": asset.media_type,
      "content-disposition": `inline; filename="${asset.filename}"`,
      "x-content-type-options": "nosniff",
    },
  });
}

async function readEditorialPayload(
  request: Request,
): Promise<EditorialDocumentPayload | Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  try {
    return (await request.json()) as EditorialDocumentPayload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
}

const parseEditorialLockedRanges = (
  raw: unknown,
  body: string,
): EditorialLockedRange[] | null => {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const ranges: EditorialLockedRange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const value = item as { start?: unknown; end?: unknown; text?: unknown };
    const start = value.start;
    const end = value.end;
    const textValue = value.text;
    if (
      typeof start !== "number" ||
      !Number.isInteger(start) ||
      typeof end !== "number" ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > body.length ||
      typeof textValue !== "string" ||
      textValue.length !== end - start ||
      body.slice(start, end) !== textValue
    )
      return null;
    ranges.push({ start, end, text: textValue });
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < ranges.length; index += 1)
    if (ranges[index - 1].end > ranges[index].start) return null;
  return ranges;
};

const storedEditorialLockedRanges = (
  raw: string | null | undefined,
  body: string,
): EditorialLockedRange[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parseEditorialLockedRanges(parsed, body) ?? [];
  } catch {
    return [];
  }
};

const editorialValues = (payload: EditorialDocumentPayload) => {
  const subject = text(payload.subject, 80);
  const category = text(payload.category, 80);
  const locale = text(payload.locale, 8);
  const slug = text(payload.slug, 100);
  const title = text(payload.title, 180);
  const summary = text(payload.summary, 800);
  const conceptId = text(payload.conceptId, 180);
  const body = text(payload.body, MAX_EDITORIAL_BODY_LENGTH);
  const writingMemo = text(
    payload.writingMemo,
    MAX_PERSONAL_WORKSPACE_NOTE_LENGTH,
  );
  const latexEngine =
    (text(payload.latexEngine, 24) as LatexEngine) || "mathjax";
  const status = text(payload.status, 20) as EditorialDocumentStatus;
  const sourceArticleId = text(payload.sourceArticleId, 180) || null;
  const lockedRanges =
    payload.lockedRanges === undefined
      ? undefined
      : parseEditorialLockedRanges(payload.lockedRanges, body);
  if (payload.lockedRanges !== undefined && !lockedRanges) return null;
  const references =
    payload.references === undefined
      ? undefined
      : normalizeArticleReferences(payload.references, MAX_PERSONAL_REFERENCES);
  if (
    !SUBJECT_SLUG.test(subject) ||
    !SUBJECT_SLUG.test(category) ||
    !["ja", "en"].includes(locale) ||
    !SUBJECT_SLUG.test(slug) ||
    !title ||
    !summary ||
    !/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/.test(conceptId) ||
    !EDITORIAL_DOCUMENT_STATUSES.has(status) ||
    !LATEX_ENGINES.has(latexEngine)
  )
    return null;
  return {
    sourceArticleId,
    subject,
    category,
    locale,
    slug,
    title,
    summary,
    conceptId,
    body,
    writingMemo,
    latexEngine,
    status,
    lockedRanges,
    references,
  };
};

async function listEditorialDocuments(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const filters: string[] = [];
  const values: unknown[] = [];
  if (!scope.allSubjects) {
    const coordinatorSubjects = (scope.coordinatorSubjects ?? []).filter((subject) => subject !== "*");
    if (!scope.subjects.length && !coordinatorSubjects.length && !scope.isProjectLeader)
      return json({
        documents: [],
        mentionNames: [],
        scope: { email: scope.email, subjects: [], isManager: scope.isManager },
      });
    const subjectValues = [...new Set([...scope.subjects, ...coordinatorSubjects])];
    const subjectFilter = subjectValues.length ? `subject IN (${subjectValues.map(() => "?").join(", ")})` : "0";
    filters.push(`(${subjectFilter} OR (publication_review_stage='project-leader' AND ? = 1) OR (publication_review_stage='subject-coordinator' AND ? = 1))`);
    values.push(...subjectValues, scope.isProjectLeader ? 1 : 0, coordinatorSubjects.length ? 1 : 0);
  }
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "1";
  if (!includeArchived) filters.push("archived_at IS NULL");
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const result = await env.REPORTS.prepare(
    `SELECT id, source_article_id, subject, category, locale, slug, title, summary, concept_id, latex_engine,
      status, created_by, updated_by, created_at, updated_at, reviewed_at, published_at, archived_at, archived_by, archive_expires_at, scheduled_publish_at, publication_review_stage,
      publication_pr_number, publication_pr_url, publication_branch, publication_action, publication_requested_at
     FROM editorial_documents${where} ORDER BY updated_at DESC LIMIT 200`,
  )
    .bind(...values)
    .all<Omit<EditorialDocument, "body">>();
  const documentRows = result.results ?? [];
  // 査読依頼テーブルは先行環境にも存在するが、古いローカルD1では
  // 未作成の場合があるため、一覧取得自体は依頼情報なしでも継続する。
  const [activeEditorsByDocument, assignmentRows] = await Promise.all([
    listEditorialActiveEditors(
      env,
      documentRows.map((document) => document.id),
    ),
    documentRows.length
      ? env.REPORTS.prepare(
          `SELECT r.document_id,
                  COALESCE(NULLIF((SELECT GROUP_CONCAT(rr.reviewer_email) FROM editorial_review_assignment_recipients rr WHERE rr.document_id = r.document_id), ''), r.reviewer_email) AS reviewer_email
           FROM editorial_review_assignments r
           WHERE r.document_id IN (${documentRows.map(() => "?").join(",")})`,
        )
          .bind(...documentRows.map((document) => document.id))
          .all<{ document_id: string; reviewer_email: string }>()
          .catch(() => ({
            results: [] as { document_id: string; reviewer_email: string }[],
          }))
      : Promise.resolve({
          results: [] as { document_id: string; reviewer_email: string }[],
        }),
  ]);
  const reviewerByDocument = new Map(
    (assignmentRows.results ?? []).map((assignment) => [
      assignment.document_id,
      assignment.reviewer_email,
    ]),
  );
  // メンション候補は、原稿の担当分野だけでなく運営に登録済みの全メンバーを
  // 表示する。担当分野で絞ると、共同レビュー相手や運営内運営が候補から消え、
  // 「自分しか候補に出ない」状態になっていた。
  const memberRows = await env.REPORTS.prepare(
    `SELECT DISTINCT p.email, COALESCE(NULLIF(TRIM(m.display_name), ''), '') AS display_name
     FROM report_admin_permissions p
     LEFT JOIN editorial_member_profiles m ON lower(m.email) = lower(p.email)
     ORDER BY display_name, p.email`,
  ).all<{ email: string; display_name: string }>();
  return json({
    documents: documentRows.map((document) => ({
      ...document,
      reviewer_email: reviewerByDocument.get(document.id) ?? null,
      active_editors: activeEditorsByDocument.get(document.id) ?? [],
    })),
    mentionNames: (memberRows.results ?? []).map(
      (member) => member.display_name.trim() || member.email.split("@")[0],
    ),
    scope: {
      email: scope.email,
      subjects: scope.subjects,
      isManager: scope.isManager,
      isProjectLeader: scope.isProjectLeader,
      coordinatorSubjects: scope.coordinatorSubjects,
    },
  });
}

const EDITORIAL_ARCHIVE_DAYS = 30;
const editorialArchiveExpiry = (now: Date) =>
  new Date(now.getTime() + EDITORIAL_ARCHIVE_DAYS * 24 * 60 * 60 * 1_000).toISOString();

async function updateEditorialDocumentArchive(
  request: Request,
  env: Env,
  documentId: string,
  archive: boolean,
): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    "SELECT id, subject, status, created_by, published_at, archived_at, archived_by, archive_expires_at FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<Pick<EditorialDocument, "id" | "subject" | "status" | "created_by" | "published_at" | "archived_at" | "archived_by" | "archive_expires_at">>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (document.status !== "draft" || document.published_at)
    return json({ error: "アーカイブできるのは未公開の下書きだけです。" }, 400);
  if (!scope.isManager && document.created_by.toLowerCase() !== scope.email.toLowerCase() && !canEditSubject(scope, document.subject))
    return json({ error: "この原稿をアーカイブする権限がありません。" }, 403);

  if (!archive) {
    if (!document.archived_at) return json({ ok: true, archived: false });
    if (document.archive_expires_at && Date.parse(document.archive_expires_at) <= Date.now())
      return json({ error: `アーカイブ期限（${EDITORIAL_ARCHIVE_DAYS}日）を過ぎたため復元できません。` }, 410);
    const now = new Date().toISOString();
    await env.REPORTS.prepare(
      "UPDATE editorial_documents SET archived_at = NULL, archived_by = NULL, archive_expires_at = NULL, updated_at = ?, updated_by = ? WHERE id = ? AND status = 'draft' AND published_at IS NULL",
    )
      .bind(now, scope.email, documentId)
      .run();
    return json({ ok: true, archived: false, archived_at: null, archive_expires_at: null });
  }

  if (document.archived_at && document.archive_expires_at && Date.parse(document.archive_expires_at) > Date.now())
    return json({ ok: true, archived: true, archived_at: document.archived_at, archive_expires_at: document.archive_expires_at });
  if (document.archived_at)
    return json({ error: `アーカイブ期限（${EDITORIAL_ARCHIVE_DAYS}日）を過ぎたため再アーカイブできません。` }, 410);
  const now = new Date();
  const archivedAt = now.toISOString();
  const archiveExpiresAt = editorialArchiveExpiry(now);
  await env.REPORTS.prepare(
    "UPDATE editorial_documents SET archived_at = ?, archived_by = ?, archive_expires_at = ?, updated_at = ?, updated_by = ? WHERE id = ? AND status = 'draft' AND published_at IS NULL",
  )
    .bind(archivedAt, scope.email, archiveExpiresAt, archivedAt, scope.email, documentId)
    .run();
  return json({ ok: true, archived: true, archived_at: archivedAt, archive_expires_at: archiveExpiresAt });
}

const normalizePersonalMathPresets = (raw: unknown): PersonalMathPreset[] => {
  if (!Array.isArray(raw)) return [];
  const presets: PersonalMathPreset[] = [];
  for (const item of raw.slice(0, MAX_PERSONAL_MATH_PRESETS)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = text(record.id, 80).trim();
    const label = text(record.label, MAX_PERSONAL_MATH_LABEL_LENGTH).trim();
    const group = text(record.group, MAX_PERSONAL_MATH_LABEL_LENGTH).trim();
    if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id) || !label) continue;
    const macros: Record<string, string> = {};
    if (!record.macros || typeof record.macros !== "object") continue;
    for (const [command, replacement] of Object.entries(
      record.macros as Record<string, unknown>,
    ).slice(0, MAX_PERSONAL_MATH_MACROS)) {
      const normalizedCommand = command.trim();
      const normalizedReplacement = text(
        replacement,
        MAX_PERSONAL_MATH_REPLACEMENT_LENGTH,
      ).trim();
      if (
        !/^\\[A-Za-z][A-Za-z0-9]*$/.test(normalizedCommand) ||
        !normalizedReplacement
      )
        continue;
      macros[normalizedCommand] = normalizedReplacement;
    }
    if (Object.keys(macros).length)
      presets.push({ id, label, ...(group ? { group } : {}), macros });
  }
  return presets;
};

const storedPersonalMathPresets = (raw: string | null | undefined) => {
  try {
    return normalizePersonalMathPresets(JSON.parse(raw ?? "[]"));
  } catch {
    return [];
  }
};

const storedPersonalReferences = (
  raw: string | null | undefined,
): PersonalReference[] => {
  try {
    return normalizeArticleReferences(
      JSON.parse(raw ?? "[]"),
      MAX_PERSONAL_REFERENCES,
    ) as PersonalReference[];
  } catch {
    return [];
  }
};

const storedArticleReferences = (
  raw: string | null | undefined,
): PersonalReference[] => {
  try {
    return normalizeArticleReferences(
      JSON.parse(raw ?? "[]"),
      MAX_PERSONAL_REFERENCES,
    ) as PersonalReference[];
  } catch {
    return [];
  }
};

async function getPersonalWorkspace(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const [documents, workspace] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT id, subject, category, title, status, updated_at, published_at, scheduled_publish_at
       FROM editorial_documents WHERE created_by = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 100`,
    )
      .bind(scope.email)
      .all<
        Pick<
          EditorialDocument,
          | "id"
          | "subject"
          | "category"
          | "title"
          | "status"
          | "updated_at"
          | "published_at"
          | "scheduled_publish_at"
        >
      >(),
    env.REPORTS.prepare(
      "SELECT private_note, updated_at, math_presets, personal_references FROM editorial_personal_workspaces WHERE email = ?",
    )
      .bind(scope.email)
      .first<{
        private_note: string;
        updated_at: string;
        math_presets: string;
        personal_references: string;
      }>(),
  ]);
  return json({
    email: scope.email,
    privateNote: workspace?.private_note ?? "",
    privateNoteUpdatedAt: workspace?.updated_at ?? null,
    mathPresets: storedPersonalMathPresets(workspace?.math_presets),
    references: storedPersonalReferences(workspace?.personal_references),
    documents: documents.results,
  });
}

async function savePersonalWorkspace(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: {
    privateNote?: unknown;
    mathPresets?: unknown;
    references?: unknown;
  };
  try {
    payload = (await request.json()) as {
      privateNote?: unknown;
      mathPresets?: unknown;
      references?: unknown;
    };
  } catch {
    return json(
      { error: "個人ワークスペースの内容を読み取れませんでした。" },
      400,
    );
  }
  const existing = await env.REPORTS.prepare(
    "SELECT private_note, math_presets, personal_references FROM editorial_personal_workspaces WHERE email = ?",
  )
    .bind(scope.email)
    .first<{
      private_note: string;
      math_presets: string;
      personal_references: string;
    }>();
  const privateNote =
    payload.privateNote === undefined
      ? (existing?.private_note ?? "")
      : text(payload.privateNote, MAX_PERSONAL_WORKSPACE_NOTE_LENGTH);
  const mathPresets =
    payload.mathPresets === undefined
      ? storedPersonalMathPresets(existing?.math_presets)
      : normalizePersonalMathPresets(payload.mathPresets);
  const references =
    payload.references === undefined
      ? storedPersonalReferences(existing?.personal_references)
      : (normalizeArticleReferences(
          payload.references,
          MAX_PERSONAL_REFERENCES,
        ) as PersonalReference[]);
  const updatedAt = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_personal_workspaces (email, private_note, updated_at, math_presets, personal_references) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET private_note = excluded.private_note, updated_at = excluded.updated_at, math_presets = excluded.math_presets, personal_references = excluded.personal_references`,
  )
    .bind(
      scope.email,
      privateNote,
      updatedAt,
      JSON.stringify(mathPresets),
      JSON.stringify(references),
    )
    .run();
  return json({ ok: true, updatedAt, mathPresets, references });
}

const taskStatus = new Set(["open", "doing", "done"]);
const availabilityStatus = new Set(["available", "maybe", "unavailable"]);
const taskKindLabel = (kind: unknown) =>
  String(kind ?? "task") === "feedback" ? "フィードバック依頼" : "タスク依頼";
const normalizedTaskAssignees = (value: unknown, fallback?: unknown) =>
  [...(Array.isArray(value) ? value : [value ?? fallback])]
    .flatMap((item) => (typeof item === "string" ? item.split(",") : [item]))
    .map((item) => text(item, 320).toLowerCase())
    .filter(Boolean)
    .filter((email, index, all) => all.indexOf(email) === index);
const taskAssignedTo = (
  assignee: unknown,
  email: string,
  kind: unknown = "task",
) => {
  const value = String(assignee ?? "").trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!value || !normalizedEmail) return false;
  return (
    (String(kind ?? "task") === "feedback" && value === "*") ||
    value
      .split(",")
      .map((item) => item.trim())
      .includes(normalizedEmail)
  );
};

type OperationProject = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

async function ensureAtlasMembership(env: Env, scope: AdminScope) {
  await env.REPORTS.prepare(
    "INSERT OR IGNORE INTO atlasez_project_memberships (project_id, email, role, joined_at) VALUES ('atlas', ?, ?, ?)",
  )
    .bind(
      scope.email,
      scope.isManager ? "manager" : "member",
      new Date().toISOString(),
    )
    .run();
}

type OperationProjectAccess = OperationProject & { role: string };

async function accessibleOperationProjects(
  env: Env,
  scope: AdminScope,
): Promise<OperationProjectAccess[]> {
  const result = scope.isManager
    ? await env.REPORTS.prepare(
        "SELECT id,slug,name,description,'manager' AS role FROM atlasez_projects ORDER BY name, id",
      ).all<OperationProjectAccess>()
    : await env.REPORTS.prepare(
        `SELECT p.id,p.slug,p.name,p.description,m.role
         FROM atlasez_projects p
         JOIN atlasez_project_memberships m ON m.project_id=p.id
         WHERE m.email=? ORDER BY p.name,p.id`,
      )
        .bind(scope.email)
        .all<OperationProjectAccess>();
  return result.results ?? [];
}

async function operationProjectRole(
  env: Env,
  scope: AdminScope,
  projectId: string,
): Promise<string | null> {
  if (scope.isManager) return "manager";
  const membership = await env.REPORTS.prepare(
    "SELECT role FROM atlasez_project_memberships WHERE project_id=? AND email=?",
  )
    .bind(projectId, scope.email)
    .first<{ role: string }>();
  return membership?.role ?? null;
}

const projectRoleLabel = (role: string) =>
  role === "manager"
    ? "運営内運営"
    : role === "member"
      ? "運営メンバー"
      : role || "担当未設定";

async function projectAssignmentLabels(
  env: Env,
  projectId: string,
  email: string,
  role: string,
): Promise<string[]> {
  const labels = [projectRoleLabel(role)];
  if (projectId !== "atlas") return labels;
  const permissions = await env.REPORTS.prepare(
    "SELECT subject FROM report_admin_permissions WHERE email=? ORDER BY subject",
  )
    .bind(email)
    .all<{ subject: string }>();
  for (const permission of permissions.results ?? []) {
    const label =
      permission.subject === "*"
        ? "全ジャンル管理"
        : `${APPLICATION_SUBJECT_LABELS[permission.subject] ?? permission.subject}担当`;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

async function getSecretariatReviewerScope(
  request: Request,
  env: Env,
): Promise<AdminScope | Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const role = await operationProjectRole(env, scope, "secretariat");
  if (role !== "manager")
    return json({ error: "運営事務局の承認担当者のみ利用できます。" }, 403);
  return scope;
}

/** プロジェクト単位のAPI境界。管理者でも、存在しないプロジェクトは開けない。 */
async function resolveOperationProject(
  env: Env,
  scope: AdminScope,
  requested: string,
): Promise<OperationProject | Response> {
  const key = requested.trim().toLowerCase() || "atlas";
  let project = await env.REPORTS.prepare(
    "SELECT id, slug, name, description FROM atlasez_projects WHERE id = ? OR slug = ? LIMIT 1",
  )
    .bind(key, key)
    .first<OperationProject>();
  // 過去データにはゼミプラットフォームの旧ID `semi-platform` が残る場合がある。
  // UIの正規slugを維持しつつ、移行済みでない環境でも既存参加者を失わない。
  if (!project && key === "seminar-platform")
    project = await env.REPORTS.prepare(
      "SELECT id, slug, name, description FROM atlasez_projects WHERE id = 'semi-platform' OR slug = 'semi-platform' LIMIT 1",
    ).first<OperationProject>();
  if (!project)
    return json({ error: "指定したプロジェクトが見つかりません。" }, 404);
  const role = await operationProjectRole(env, scope, project.id);
  if (!role)
    return json({ error: "このプロジェクトのメンバーではありません。" }, 403);
  return project;
}

type ProjectReviewerScope = {
  scope: AdminScope;
  project: OperationProject;
};

async function getProjectReviewerScope(
  request: Request,
  env: Env,
  requestedProject: string,
): Promise<ProjectReviewerScope | Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const project = await resolveOperationProject(env, scope, requestedProject);
  if (isResponse(project)) return project;
  const role = await operationProjectRole(env, scope, project.id);
  if (role !== "manager")
    return json(
      { error: "このプロジェクトの運営内運営のみ利用できます。" },
      403,
    );
  return { scope, project };
}

async function postDiscordWebhook(url: string | undefined, content: string) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content: content.slice(0, 1_900),
        allowed_mentions: { parse: [] },
      }),
    });
  } catch {
    /* 通知失敗は本文保存を妨げない。 */
  }
}

const emailSafe = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );

async function applicationOperatorEmails(env: Env) {
  const configured = (env.APPLICATION_OPERATIONS_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => EMAIL_PATTERN.test(value));
  if (configured.length) return [...new Set(configured)];
  const managers = await env.REPORTS.prepare(
    `SELECT DISTINCT lower(trim(email)) AS email FROM (
       SELECT email FROM report_admin_permissions WHERE subject='*'
       UNION ALL
       SELECT email FROM atlasez_project_memberships
        WHERE project_id='secretariat' AND role='manager'
     ) WHERE trim(email)!=''`,
  ).all<{ email: string }>();
  return [
    ...new Set(
      (managers.results ?? [])
        .map((row) => row.email.trim().toLowerCase())
        .filter((value) => EMAIL_PATTERN.test(value)),
    ),
  ];
}

async function queueApplicationEmails(
  env: Env,
  application: {
    id: string;
    name: string;
    email: string;
    projectLabel: string;
    projectSlug: string;
    createdAt: string;
  },
) {
  const operatorEmails = await applicationOperatorEmails(env);
  const applicantText = [
    "Atlasez運営です。",
    "",
    `${application.projectLabel}への応募を受け付けました。`,
    "内容を確認のうえ、運営から必要な連絡をお送りします。",
    "このメールに心当たりがない場合は、Atlasez運営までご連絡ください。",
  ].join("\n");
  const operatorText = [
    "Atlasezに新しい応募が届きました。",
    "",
    `プロジェクト: ${application.projectLabel}`,
    `応募者: ${application.name}`,
    `メール: ${application.email}`,
    `応募日時: ${application.createdAt}`,
    "",
    `管理画面で確認: https://admin.atlasez.org/admin/applications/?project=${encodeURIComponent(application.projectSlug)}`,
  ].join("\n");
  const applicantSubject = `Atlasez｜${application.projectLabel}への応募を受け付けました`;
  const operatorSubject = `Atlasez｜新しい応募：${application.projectLabel} / ${application.name}`;
  const rows = [
    {
      kind: "applicant_confirmation",
      email: application.email,
      subject: applicantSubject,
      textBody: applicantText,
      htmlBody: `<h2>応募を受け付けました</h2><p>${emailSafe(application.projectLabel)}への応募を受け付けました。</p><p>内容を確認のうえ、運営から必要な連絡をお送りします。</p>`,
    },
    ...operatorEmails.map((email) => ({
      kind: "operator_notification",
      email,
      subject: operatorSubject,
      textBody: operatorText,
      htmlBody: `<h2>新しい応募が届きました</h2><p><b>プロジェクト:</b> ${emailSafe(application.projectLabel)}<br><b>応募者:</b> ${emailSafe(application.name)}<br><b>メール:</b> ${emailSafe(application.email)}<br><b>応募日時:</b> ${emailSafe(application.createdAt)}</p><p><a href="https://admin.atlasez.org/admin/applications/?project=${encodeURIComponent(application.projectSlug)}">管理画面で確認する</a></p>`,
    })),
  ];
  if (!rows.length) return { queued: 0, operatorCount: 0 };
  await env.REPORTS.batch(
    rows.map((row) =>
      env.REPORTS.prepare(
        `INSERT OR IGNORE INTO atlasez_application_email_deliveries
         (id,application_id,recipient_email,kind,subject,text_body,html_body,status,attempt_count,next_attempt_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'pending',0,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        application.id,
        row.email,
        row.kind,
        row.subject,
        row.textBody,
        row.htmlBody,
        application.createdAt,
        application.createdAt,
        application.createdAt,
      ),
    ),
  );
  return { queued: rows.length, operatorCount: operatorEmails.length };
}

async function queueApplicationAcceptanceEmail(
  env: Env,
  application: {
    id: string;
    email: string;
    projectSlug: string;
    formLanguage: string;
  },
  acceptedAt: string,
) {
  const projectLabel =
    APPLICATION_FORM_LABELS[application.projectSlug] ?? application.projectSlug;
  const english = application.formLanguage === "en";
  const subject = english
    ? `Atlasez | Your application to ${projectLabel} was accepted`
    : `Atlasez｜${projectLabel}への参加が承認されました`;
  const textBody = english
    ? [
        "This is Atlasez management.",
        "",
        `Your application to ${projectLabel} has been accepted.`,
        "Please sign in to the Atlasez management site and follow the onboarding instructions.",
        "If you have not connected Discord yet, open the application status page and choose ‘Connect Discord’ once.",
        "",
        "Application status: https://admin.atlasez.org/applicant/",
      ].join("\n")
    : [
        "Atlasez運営です。",
        "",
        `${projectLabel}への参加が承認されました。`,
        "管理サイトへログインし、オンボーディングの案内に沿って参加手続きを進めてください。",
        "Discord連携がまだの場合は、応募状況ページから「Discordと連携」を1回実行してください。",
        "",
        "応募状況：https://admin.atlasez.org/applicant/",
      ].join("\n");
  const htmlBody = english
    ? `<h2>Application accepted</h2><p>Your application to ${emailSafe(projectLabel)} has been accepted.</p><p>Please sign in and follow the onboarding instructions. If Discord is not connected yet, choose “Connect Discord” once on the application status page.</p><p><a href="https://admin.atlasez.org/applicant/">Open application status</a></p>`
    : `<h2>参加が承認されました</h2><p>${emailSafe(projectLabel)}への参加が承認されました。</p><p>管理サイトへログインし、オンボーディングの案内に沿って参加手続きを進めてください。Discord連携がまだの場合は、応募状況ページから「Discordと連携」を1回実行してください。</p><p><a href="https://admin.atlasez.org/applicant/">応募状況を開く</a></p>`;
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO atlasez_application_email_deliveries
     (id,application_id,recipient_email,kind,subject,text_body,html_body,status,attempt_count,next_attempt_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'pending',0,?,?,?)`,
  )
    .bind(
      crypto.randomUUID(),
      application.id,
      application.email,
      "applicant_acceptance",
      subject,
      textBody,
      htmlBody,
      acceptedAt,
      acceptedAt,
      acceptedAt,
    )
    .run();
}

async function queueApplicationDiscordEmail(
  env: Env,
  application: { id: string; email: string; projectSlug: string; formLanguage: string },
  status: "synced" | "failed",
  error = "",
) {
  const projectLabel =
    APPLICATION_FORM_LABELS[application.projectSlug] ?? application.projectSlug;
  const english = application.formLanguage === "en";
  const success = status === "synced";
  const kind = success ? "applicant_discord_success" : "applicant_discord_failure";
  const subject = english
    ? `Atlasez | Discord connection ${success ? "completed" : "needs attention"}`
    : `Atlasez｜Discord連携${success ? "が完了しました" : "を確認してください"}`;
  const textBody = english
    ? success
      ? `Your Discord account has been connected to ${projectLabel}, and your existing server roles were checked.\n\nOpen your application status: https://admin.atlasez.org/applicant/`
      : `We could not finish connecting your Discord account to ${projectLabel}. We will retry automatically.\n\n${error}\n\nCheck your application status: https://admin.atlasez.org/applicant/`
    : success
      ? `${projectLabel}のDiscord連携が完了し、既存ロールとの照合が完了しました。\n\n応募状況：https://admin.atlasez.org/applicant/`
      : `${projectLabel}のDiscord連携を完了できませんでした。システムが自動で再試行します。\n\n${error}\n\n応募状況：https://admin.atlasez.org/applicant/`;
  const htmlBody = success
    ? `<h2>Discord連携が完了しました</h2><p>${emailSafe(projectLabel)}のDiscordサーバー参加と既存ロールの照合が完了しました。</p><p><a href="https://admin.atlasez.org/applicant/">応募状況を確認する</a></p>`
    : `<h2>Discord連携を確認してください</h2><p>${emailSafe(projectLabel)}のDiscord連携を完了できませんでした。自動で再試行します。</p><p>${emailSafe(error)}</p><p><a href="https://admin.atlasez.org/applicant/">応募状況を確認する</a></p>`;
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO atlasez_application_email_deliveries
     (id,application_id,recipient_email,kind,subject,text_body,html_body,status,attempt_count,next_attempt_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'pending',0,?,?,?)`,
  )
    .bind(crypto.randomUUID(), application.id, application.email, kind, subject, textBody, htmlBody, now, now, now)
    .run();
}

async function createApplicationResponseTask(
  env: Env,
  application: {
    id: string;
    name: string;
    email: string;
    projectLabel: string;
    projectSlug: string;
    createdAt: string;
  },
) {
  const title = `応募対応：${application.projectLabel} / ${application.name}`;
  const details = [
    `応募ID: ${application.id}`,
    `応募者: ${application.name}`,
    `メール: ${application.email}`,
    `プロジェクト: ${application.projectLabel}`,
    "応募管理で内容を確認し、応募者への対応を進めてください。",
  ].join("\n");
  await env.REPORTS.prepare(
    `INSERT INTO editorial_tasks
     (id,project_id,subject,assignee_email,title,details,status,due_at,due_timezone,reminder_at,reminder_repeat,reminder_email,created_by,created_at,updated_at)
     VALUES (?, 'secretariat', NULL, NULL, ?, ?, 'open', NULL, 'Asia/Tokyo', NULL, 'none', NULL, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      title,
      details,
      "応募フォーム",
      application.createdAt,
      application.createdAt,
    )
    .run();
}

async function notifyProgressToDiscord(
  env: Env,
  subject: string | null,
  body: string,
) {
  const subjectLabel = subject ? `【${subject}】` : "【全体】";
  const message = `📌 ${subjectLabel} 進捗報告\n${body}`;
  await Promise.all([
    postDiscordWebhook(env.DISCORD_PROGRESS_WEBHOOK_URL, message),
    postDiscordWebhook(env.DISCORD_ATLAS_WEBHOOK_URL, message),
    postDiscordChannel(env, env.DISCORD_PROGRESS_CHANNEL_ID, message),
    postDiscordSubjectChannel(env, subject, message),
  ]);
}

async function postDiscordSubjectChannel(
  env: Env,
  subject: string | null,
  content: string,
) {
  if (!env.DISCORD_BOT_TOKEN || !subject) return;
  const channel = await env.REPORTS.prepare(
    "SELECT discord_channel_id FROM atlasez_discord_channel_mappings WHERE project_id = 'atlas' AND subject = ?",
  )
    .bind(subject)
    .first<{ discord_channel_id: string }>();
  if (!channel) return;
  try {
    await fetch(
      `https://discord.com/api/v10/channels/${channel.discord_channel_id}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: content.slice(0, 1_900),
          allowed_mentions: { parse: [] },
        }),
      },
    );
  } catch {
    /* Discord設定が未完了でも進捗保存は継続する。 */
  }
}

async function postDiscordChannel(
  env: Env,
  channelId: string | undefined,
  content: string,
) {
  if (!env.DISCORD_BOT_TOKEN || !channelId) return;
  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: content.slice(0, 1_900),
        allowed_mentions: { parse: [] },
      }),
    });
  } catch {
    /* 通知失敗は進捗保存を妨げない。 */
  }
}

type DiscordGuildTargetResult =
  | { ok: true; name: string }
  | { ok: false; message: string };

async function verifyDiscordGuildTarget(
  env: Env,
  headers: Record<string, string>,
): Promise<DiscordGuildTargetResult> {
  if (!env.DISCORD_GUILD_ID)
    return { ok: false, message: "DiscordサーバーIDが未設定です。" };
  let response: Response;
  try {
    response = await fetch(
      `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}`,
      { headers },
    );
  } catch {
    return { ok: false, message: "Discordサーバーへ接続できません。" };
  }
  if (!response.ok)
    return {
      ok: false,
      message: "Botが設定されたDiscordサーバーを確認できません。",
    };
  const guild = (await response.json()) as { name?: string };
  const name = guild.name?.trim() ?? "";
  const expected = env.DISCORD_GUILD_NAME?.trim();
  if (expected && name.toLocaleLowerCase() !== expected.toLocaleLowerCase())
    return {
      ok: false,
      message: `接続先Discordサーバーが想定と異なります（${name || "名称不明"}）。設定値を確認してください。`,
    };
  return { ok: true, name };
}

type DiscordProvisioningResult = {
  status: "synced" | "skipped" | "failed";
  applied: number;
  warnings: string[];
};

type DiscordAccountTokenRow = {
  discord_user_id: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  token_expires_at: string | null;
};

async function discordAccessToken(
  env: Env,
  account: DiscordAccountTokenRow,
): Promise<string> {
  if (!account.access_token_ciphertext) return "";
  const expiresAt = account.token_expires_at
    ? new Date(account.token_expires_at).getTime()
    : 0;
  if (expiresAt > Date.now() + 30_000)
    return decryptDiscordSecret(env, account.access_token_ciphertext);
  if (!account.refresh_token_ciphertext || !discordOAuthConfigured(env)) return "";
  const refreshToken = await decryptDiscordSecret(env, account.refresh_token_ciphertext);
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_OAUTH_CLIENT_ID ?? "",
      client_secret: env.DISCORD_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) return "";
  const token = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token) return "";
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `UPDATE atlasez_member_discord_accounts
        SET access_token_ciphertext=?,refresh_token_ciphertext=?,token_expires_at=?,oauth_scope=?,updated_at=?
      WHERE discord_user_id=?`,
  )
    .bind(
      await encryptDiscordSecret(env, token.access_token),
      await encryptDiscordSecret(env, token.refresh_token ?? refreshToken),
      new Date(Date.now() + Math.max(0, Number(token.expires_in ?? 0) - 60) * 1_000).toISOString(),
      token.scope ?? DISCORD_OAUTH_SCOPE,
      now,
      account.discord_user_id,
    )
    .run();
  return token.access_token;
}

/**
 * 応募承認用のDiscord確認。既存ロールを読み取り、運営サイト側の対応表と
 * 応募者の現在の付与状況を確認する。Discordのロールは作成・変更しない。
 */
async function provisionApplicationDiscordRoles(
  env: Env,
  email: string,
  subjects: string[],
  attrs: {
    institution: string;
    year: string;
    affiliationType: string;
    interests: string[];
  },
): Promise<DiscordProvisioningResult> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID)
    return {
      status: "skipped",
      applied: 0,
      warnings: ["Discord Botが未設定です。"],
    };
  const account = await env.REPORTS.prepare(
    `SELECT discord_user_id,access_token_ciphertext,refresh_token_ciphertext,
            token_expires_at
       FROM atlasez_member_discord_accounts WHERE email = ?`,
  )
    .bind(email)
    .first<DiscordAccountTokenRow>();
  if (!account?.discord_user_id)
    return {
      status: "skipped",
      applied: 0,
      warnings: ["DiscordユーザーIDが未登録です。"],
    };

  const headers = {
    authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    "content-type": "application/json",
  };
  const guildTarget = await verifyDiscordGuildTarget(env, headers);
  if (!guildTarget.ok)
    return {
      status: "failed",
      applied: 0,
      warnings: [guildTarget.message],
    };
  let memberResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}`,
    { headers },
  );
  if (!memberResponse.ok && account.access_token_ciphertext) {
    try {
      const accessToken = await discordAccessToken(env, account);
      if (accessToken) {
        const joinResponse = await fetch(
          `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({ access_token: accessToken }),
          },
        );
        if (joinResponse.ok || joinResponse.status === 204 || joinResponse.status === 201)
          memberResponse = await fetch(
            `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/members/${account.discord_user_id}`,
            { headers },
          );
      }
    } catch {
      // 下の共通エラー表示で、状態を再試行可能な失敗として記録する。
    }
  }
  if (!memberResponse.ok)
    return {
      status: "failed",
      applied: 0,
      warnings: [
        account.access_token_ciphertext
          ? "Discordサーバーへ対象ユーザーを追加できませんでした。Bot権限・OAuth同意・サーバーIDを確認してください。"
          : "Discordサーバー内に対象ユーザーが見つかりません。応募者にDiscord連携を依頼してください。",
      ],
    };
  const rolesResponse = await fetch(
    `https://discord.com/api/v10/guilds/${env.DISCORD_GUILD_ID}/roles`,
    { headers },
  );
  if (!rolesResponse.ok)
    return {
      status: "failed",
      applied: 0,
      warnings: ["Discordのロール一覧を取得できません。"],
    };
  const member = (await memberResponse.json()) as { roles?: string[] };
  const guildRoles = (await rolesResponse.json()) as Array<{
    id: string;
    name: string;
  }>;
  const desired = new Set<string>();
  const warnings: string[] = [];

  const ensureMappedRole = async (
    kind: "subject" | "attribute" | "affiliation",
    key: string,
    label: string,
  ) => {
    let roleId = "";
    if (kind === "attribute") {
      const mapping = await env.REPORTS.prepare(
        "SELECT discord_role_id FROM atlasez_discord_attribute_role_mappings WHERE attribute_type = ? AND attribute_value = ?",
      )
        .bind(key.split(":", 1)[0], key.slice(key.indexOf(":") + 1))
        .first<{ discord_role_id: string }>();
      roleId = mapping?.discord_role_id ?? "";
    } else {
      const mappingSubject =
        kind === "affiliation" ? `__affiliation__${key}` : key;
      const mapping = await env.REPORTS.prepare(
        "SELECT discord_role_id FROM atlasez_discord_role_mappings WHERE project_id = 'atlas' AND subject = ?",
      )
        .bind(mappingSubject)
        .first<{ discord_role_id: string }>();
      roleId = mapping?.discord_role_id ?? "";
    }
    if (!roleId || !guildRoles.some((role) => role.id === roleId))
      roleId =
        guildRoles.find((role) => role.name.trim() === label.trim())?.id ?? "";
    if (!roleId) {
      warnings.push(`Discordに「${label}」ロールが存在しません。運営サイト側の対応表だけを確認しました。`);
      return;
    }
    if (kind === "attribute") {
      const attributeType = key.split(":", 1)[0];
      const attributeValue = key.slice(key.indexOf(":") + 1);
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_attribute_role_mappings (attribute_type,attribute_value,discord_role_id) VALUES (?,?,?) ON CONFLICT(attribute_type,attribute_value) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(attributeType, attributeValue, roleId)
        .run();
    } else {
      const mappingSubject =
        kind === "affiliation" ? `__affiliation__${key}` : key;
      await env.REPORTS.prepare(
        "INSERT INTO atlasez_discord_role_mappings (project_id,subject,discord_role_id) VALUES ('atlas',?,?) ON CONFLICT(project_id,subject) DO UPDATE SET discord_role_id=excluded.discord_role_id",
      )
        .bind(mappingSubject, roleId)
        .run();
    }
    desired.add(roleId);
  };

  for (const subject of subjects) {
    if (subject === "*")
      await ensureMappedRole("subject", "__manager__", "運営内運営");
    else
      await ensureMappedRole(
        "subject",
        subject,
        APPLICATION_SUBJECT_LABELS[subject] ?? subject,
      );
  }
  if (attrs.affiliationType)
    await ensureMappedRole(
      "affiliation",
      attrs.affiliationType,
      attrs.affiliationType,
    );
  if (attrs.institution)
    await ensureMappedRole(
      "attribute",
      `university:${attrs.institution}`,
      attrs.institution,
    );
  if (attrs.year)
    await ensureMappedRole("attribute", `year:${attrs.year}`, attrs.year);
  for (const interest of attrs.interests)
    if (interest)
      await ensureMappedRole("attribute", `interest:${interest}`, interest);

  const current = new Set(member.roles ?? []);
  const missingOnMember = [...desired].filter((roleId) => !current.has(roleId));
  if (missingOnMember.length)
    warnings.push(
      `Discord側で未付与の既存ロールが${missingOnMember.length}件あります。運営サイトからDiscordのロールは変更しません。`,
    );
  return {
    status: warnings.length ? "skipped" : "synced",
    applied: 0,
    warnings,
  };
}

const discordProvisionRetryDelay = (attempt: number) => {
  const delays = [5, 30, 120, 720, 1_440, 2_880];
  return delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)] * 60_000;
};

async function provisionAcceptedApplication(
  env: Env,
  applicationId: string,
): Promise<DiscordProvisioningResult & { attempt: number; nextAttemptAt: string | null }> {
  const application = await env.REPORTS.prepare(
    `SELECT id,email,status,project_slug,form_language,institution,grade,affiliation_type,
            desired_subjects,provisioning_attempt_count
       FROM atlasez_member_applications WHERE id=?`,
  )
    .bind(applicationId)
    .first<{
      id: string;
      email: string;
      status: string;
      project_slug: string;
      form_language: string;
      institution: string;
      grade: string;
      affiliation_type: string;
      desired_subjects: string;
      provisioning_attempt_count: number;
    }>();
  if (!application || application.status !== "accepted")
    return { status: "skipped", applied: 0, warnings: ["受入済みの応募ではありません。"], attempt: 0, nextAttemptAt: null };
  const subjects = application.desired_subjects
    .split(",")
    .map((value) => value.trim())
    .filter((value) => APPLICATION_SUBJECT_LABELS[value]);
  const interests = subjects.map((subject) => APPLICATION_SUBJECT_LABELS[subject]).filter(Boolean);
  const result = await provisionApplicationDiscordRoles(env, application.email, subjects, {
    institution: application.institution,
    year: application.grade,
    affiliationType: application.affiliation_type,
    interests,
  });
  const attempt = Number(application.provisioning_attempt_count ?? 0) + 1;
  const nextAttemptAt =
    result.status === "failed" && attempt < DISCORD_PROVISION_MAX_ATTEMPTS
      ? new Date(Date.now() + discordProvisionRetryDelay(attempt)).toISOString()
      : null;
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `UPDATE atlasez_member_applications
        SET provisioning_status=?,provisioning_error=?,provisioned_at=?,
            provisioning_attempt_count=?,provisioning_next_attempt_at=?,
            provisioning_last_attempt_at=?,updated_at=?
      WHERE id=? AND status='accepted'`,
  )
    .bind(
      result.status,
      result.warnings.join("\n").slice(0, 2_000),
      result.status === "synced" ? now : null,
      attempt,
      nextAttemptAt,
      now,
      now,
      application.id,
    )
    .run();
  if (result.status === "synced" || (result.status === "failed" && attempt === 1)) {
    try {
      await queueApplicationDiscordEmail(
        env,
        {
          id: application.id,
          email: application.email,
          projectSlug: application.project_slug,
          formLanguage: application.form_language,
        },
        result.status,
        result.warnings.join(" "),
      );
    } catch (error) {
      console.error("application Discord status email queue failed", { applicationId, error });
    }
  }
  return { ...result, attempt, nextAttemptAt };
}

async function provisionAcceptedApplicationsForEmail(env: Env, email: string) {
  const rows = await env.REPORTS.prepare(
    "SELECT id FROM atlasez_member_applications WHERE lower(email)=lower(?) AND status='accepted'",
  )
    .bind(email)
    .all<{ id: string }>();
  return Promise.all((rows.results ?? []).map((row) => provisionAcceptedApplication(env, row.id)));
}

async function dispatchPendingDiscordProvisioning(env: Env) {
  const now = new Date().toISOString();
  const rows = await env.REPORTS.prepare(
    `SELECT id FROM atlasez_member_applications
      WHERE status='accepted' AND provisioning_status='failed'
        AND provisioning_next_attempt_at IS NOT NULL
        AND provisioning_next_attempt_at<=?
      ORDER BY provisioning_next_attempt_at ASC LIMIT 25`,
  )
    .bind(now)
    .all<{ id: string }>();
  let claimed = 0;
  for (const row of rows.results ?? []) {
    const claim = (await env.REPORTS.prepare(
      `UPDATE atlasez_member_applications
          SET provisioning_status='pending',provisioning_next_attempt_at=NULL,updated_at=?
        WHERE id=? AND status='accepted' AND provisioning_status='failed'
          AND provisioning_next_attempt_at IS NOT NULL AND provisioning_next_attempt_at<=?`,
    )
      .bind(now, row.id, now)
      .run()) as { meta?: { changes?: number } };
    if (claim.meta?.changes !== 1) continue;
    claimed += 1;
    await provisionAcceptedApplication(env, row.id);
  }
  return { claimed };
}

async function getMyProfile(request: Request, env: Env): Promise<Response> {
  const scope = await getMemberProfileScope(request, env);
  if (isResponse(scope)) return scope;
  const [profile, discord, pendingRequest] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT display_name, bio, availability_note, avatar_url, university, year, interests, affiliation_type, country, timezone, updated_at FROM editorial_member_profiles WHERE email = ?",
    )
      .bind(scope.email)
      .first<{
        display_name: string;
        bio: string;
        availability_note: string;
        avatar_url: string;
        university: string;
        year: string;
        interests: string;
        affiliation_type: string;
        country: string;
        timezone: string;
        updated_at: string;
      }>(),
    env.REPORTS.prepare(
      "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
    )
      .bind(scope.email)
      .first<{ discord_user_id: string }>(),
    env.REPORTS.prepare(
      `SELECT id,proposed_display_name,proposed_university,proposed_year,
        proposed_affiliation_type,proposed_country,proposed_timezone,proposed_bio,
        status,submitted_at,reviewed_at,review_note
       FROM editorial_member_profile_change_requests
       WHERE email=? ORDER BY submitted_at DESC LIMIT 1`,
    )
      .bind(scope.email)
      .first<Record<string, unknown>>(),
  ]);
  const roles = [
    ...(scope.isManager ? ["全分野管理者"] : []),
    ...scope.subjects.map(
      (subject) => APPLICATION_SUBJECT_LABELS[subject] ?? subject,
    ),
  ];
  return json({
    email: scope.email,
    subjects: scope.subjects,
    roles,
    isManager: scope.isManager,
    discordUserId: discord?.discord_user_id ?? "",
    profileChangeRequest: pendingRequest ?? null,
    profile: profile ?? {
      display_name: "",
      bio: "",
      availability_note: "",
      avatar_url: "",
      university: "",
      year: "",
      interests: "",
      affiliation_type: "",
      country: "",
      timezone: "Asia/Tokyo",
      updated_at: null,
    },
  });
}

async function portalOverview(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const projects = scope.isManager
    ? await env.REPORTS.prepare(
        `SELECT p.id,p.slug,p.name,p.description,'manager' AS role FROM atlasez_projects p ORDER BY p.name`,
      ).all()
    : await env.REPORTS.prepare(
        `SELECT p.id,p.slug,p.name,p.description,m.role FROM atlasez_projects p JOIN atlasez_project_memberships m ON m.project_id=p.id WHERE m.email=? ORDER BY p.name`,
      )
        .bind(scope.email)
        .all();
  const projectRows = projects.results as Array<{
    id: string;
    slug: string;
    name: string;
  }>;
  const projectIds = projectRows.map((project) => project.id).filter(Boolean);
  const todos = projectIds.length
    ? await env.REPORTS.prepare(
        `SELECT t.id,t.project_id,t.subject,t.assignee_email,t.task_kind,t.title,t.details,t.status,t.due_at,t.due_timezone,t.updated_at,
           p.name AS project_name
         FROM editorial_tasks t JOIN atlasez_projects p ON p.id=t.project_id
         WHERE t.project_id IN (${projectIds.map(() => "?").join(",")})
           AND (lower(t.assignee_email)=lower(?) OR instr(',' || lower(COALESCE(t.assignee_email,'')) || ',', ',' || lower(?) || ',') > 0 OR (t.task_kind='feedback' AND t.assignee_email='*'))
           AND t.status != 'done'
         ORDER BY CASE WHEN t.due_at IS NULL OR t.due_at='' THEN 1 ELSE 0 END,t.due_at,t.updated_at DESC LIMIT 100`,
      )
        .bind(...projectIds, scope.email, scope.email)
        .all()
    : { results: [] };
  const rangeStart = new Date();
  rangeStart.setMonth(rangeStart.getMonth() - 2, 1);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date();
  rangeEnd.setMonth(rangeEnd.getMonth() + 13, 0);
  rangeEnd.setHours(23, 59, 59, 999);
  const calendarDateKey = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const rangeStartKey = calendarDateKey(rangeStart);
  const rangeEndKey = calendarDateKey(rangeEnd);
  const calendarRows = projectIds.length
    ? await Promise.all([
        env.REPORTS.prepare(
          `SELECT e.id, e.project_id, e.title, e.details, e.starts_at, e.ends_at, e.timezone,
             p.name AS project_name
           FROM editorial_events e
           JOIN atlasez_projects p ON p.id = e.project_id
           WHERE e.project_id IN (${projectIds.map(() => "?").join(",")})
             AND substr(e.starts_at, 1, 10) >= ? AND substr(e.starts_at, 1, 10) <= ?
           ORDER BY e.starts_at ASC LIMIT 300`,
        )
          .bind(...projectIds, rangeStartKey, rangeEndKey)
          .all<{
            id: string;
            project_id: string;
            title: string;
            details: string;
            starts_at: string;
            ends_at: string | null;
            timezone: string;
            project_name: string;
          }>(),
        env.REPORTS.prepare(
          `SELECT t.id, t.project_id, t.title, t.details, t.due_at AS starts_at,
             t.due_timezone AS timezone, p.name AS project_name
           FROM editorial_tasks t
           JOIN atlasez_projects p ON p.id = t.project_id
           WHERE t.project_id IN (${projectIds.map(() => "?").join(",")})
             AND (lower(t.assignee_email)=lower(?) OR instr(',' || lower(COALESCE(t.assignee_email,'')) || ',', ',' || lower(?) || ',') > 0 OR (t.task_kind='feedback' AND t.assignee_email='*')) AND t.status != 'done'
             AND t.due_at IS NOT NULL
             AND substr(t.due_at, 1, 10) >= ? AND substr(t.due_at, 1, 10) <= ?
           ORDER BY t.due_at ASC LIMIT 300`,
        )
          .bind(...projectIds, scope.email, scope.email, rangeStartKey, rangeEndKey)
          .all<{
            id: string;
            project_id: string;
            title: string;
            details: string;
            starts_at: string;
            timezone: string;
            project_name: string;
          }>(),
      ])
    : [{ results: [] }, { results: [] }];
  const organizationEvents = calendarRows[0].results ?? [];
  const personalDeadlines = calendarRows[1].results ?? [];
  return json({
    email: scope.email,
    projects: projects.results,
    todos: todos.results,
    calendar: {
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
      events: [
        ...organizationEvents.map((event) => ({
          id: `event:${event.id}`,
          kind: "organization" as const,
          title: event.title,
          details: event.details,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          timezone: event.timezone,
          projectId: event.project_id,
          projectName: event.project_name,
        })),
        ...personalDeadlines.map((task) => ({
          id: `task:${task.id}`,
          kind: "personal" as const,
          title: task.title,
          details: task.details,
          startsAt: task.starts_at,
          endsAt: null,
          timezone: task.timezone,
          projectId: task.project_id,
          projectName: task.project_name,
        })),
      ],
    },
  });
}

async function memberTasksOverview(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const projects = await accessibleOperationProjects(env, scope);
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return json({ projects: [], tasks: [], members: [] });
  const placeholders = projectIds.map(() => "?").join(",");
  const [tasks, members] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT id,project_id,subject,assignee_email,task_kind,title,details,status,due_at,due_timezone,
        created_by,created_at,updated_at FROM editorial_tasks
       WHERE project_id IN (${placeholders})
       ORDER BY status='done',CASE WHEN due_at IS NULL OR due_at='' THEN 1 ELSE 0 END,
        due_at ASC,updated_at DESC LIMIT 500`,
    )
      .bind(...projectIds)
      .all<Record<string, unknown>>(),
    env.REPORTS.prepare(
      `SELECT m.project_id,m.email,
        COALESCE(NULLIF(TRIM(p.display_name),''),m.email) AS display_name
       FROM atlasez_project_memberships m
       LEFT JOIN editorial_member_profiles p ON p.email=m.email
       WHERE m.project_id IN (${placeholders})
       ORDER BY display_name,m.email`,
    )
      .bind(...projectIds)
      .all<Record<string, unknown>>(),
  ]);
  const managerProjects = new Set(
    projects
      .filter((project) => project.role === "manager")
      .map((project) => project.id),
  );
  const visibleTasks = (tasks.results ?? []).filter(
    (task) =>
      managerProjects.has(String(task.project_id)) ||
      taskAssignedTo(task.assignee_email, scope.email, task.task_kind) ||
      task.created_by === scope.email ||
      task.subject === null ||
      scope.subjects.includes(String(task.subject ?? "")),
  );
  return json({
    scope: { email: scope.email, isManager: scope.isManager },
    projects,
    tasks: visibleTasks,
    members: members.results ?? [],
  });
}

async function memberCalendarOverview(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const projects = await accessibleOperationProjects(env, scope);
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length)
    return json({
      scope: { email: scope.email, isManager: false },
      projects: [],
      events: [],
      availabilityBlocks: [],
    });
  const placeholders = projectIds.map(() => "?").join(",");
  const [events, availability, availabilityBlocks] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT id,project_id,subject,title,details,starts_at,ends_at,timezone,created_by,created_at
       FROM editorial_events WHERE project_id IN (${placeholders})
       ORDER BY starts_at ASC LIMIT 600`,
    )
      .bind(...projectIds)
      .all<Record<string, unknown>>(),
    env.REPORTS.prepare(
      `SELECT a.event_id,a.email,a.availability,
        COALESCE(NULLIF(TRIM(p.display_name),''),'表示名未設定') AS display_name
       FROM editorial_event_availability a
       JOIN editorial_events e ON e.id=a.event_id
       LEFT JOIN editorial_member_profiles p ON p.email=a.email
       WHERE e.project_id IN (${placeholders})`,
    )
      .bind(...projectIds)
      .all<{
        event_id: string;
        email: string;
        availability: string;
        display_name: string;
      }>(),
    env.REPORTS.prepare(
      `SELECT b.id,b.email,b.starts_at,b.ends_at,b.timezone,
        CASE WHEN lower(b.email)=lower(?) THEN b.label ELSE '' END AS label,
        b.kind,COALESCE(NULLIF(TRIM(p.display_name),''),'表示名未設定') AS display_name
       FROM editorial_member_availability_blocks b
       LEFT JOIN editorial_member_profiles p ON lower(p.email)=lower(b.email)
       ORDER BY b.starts_at ASC LIMIT 500`,
    )
      .bind(scope.email)
      .all<Record<string, unknown>>(),
  ]);
  const participantsByEvent = new Map<
    string,
    Array<{ email: string; availability: string; display_name: string }>
  >();
  for (const item of availability.results ?? [])
    participantsByEvent.set(item.event_id, [
      ...(participantsByEvent.get(item.event_id) ?? []),
      item,
    ]);
  return json({
    scope: { email: scope.email, isManager: false },
    availabilityBlocks: (availabilityBlocks.results ?? []).map((block) => ({
      ...block,
      isSelf:
        String(block.email ?? "").toLowerCase() === scope.email.toLowerCase(),
    })),
    projects,
    events: (events.results ?? []).map((event) => {
      const participants = participantsByEvent.get(String(event.id)) ?? [];
      return {
        ...event,
        availability:
          participants.find((item) => item.email === scope.email)
            ?.availability ?? null,
        availabilityCounts: {
          available: participants.filter(
            (item) => item.availability === "available",
          ).length,
          maybe: participants.filter((item) => item.availability === "maybe")
            .length,
          unavailable: participants.filter(
            (item) => item.availability === "unavailable",
          ).length,
        },
        participants: participants.map((participant) => ({
          displayName: participant.display_name,
          availability: participant.availability,
          isSelf: participant.email.toLowerCase() === scope.email.toLowerCase(),
        })),
      };
    }),
  });
}

async function createAtlasezProject(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let p: {
    slug?: unknown;
    name?: unknown;
    description?: unknown;
    memberEmails?: unknown;
  };
  try {
    p = (await request.json()) as typeof p;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const slug = text(p.slug, 60).toLowerCase(),
    name = text(p.name, 100),
    description = text(p.description, 1000);
  if (!/^[a-z0-9-]{2,60}$/.test(slug) || !name)
    return json(
      {
        error:
          "英小文字・数字・ハイフンのプロジェクトIDと名称を入力してください。",
      },
      400,
    );
  const members = Array.isArray(p.memberEmails)
    ? p.memberEmails
        .map((v) => text(v, 320).toLowerCase())
        .filter((v) => EMAIL_PATTERN.test(v))
    : [];
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  try {
    await env.REPORTS.prepare(
      "INSERT INTO atlasez_projects (id,slug,name,description,created_at) VALUES (?,?,?,?,?)",
    )
      .bind(id, slug, name, description, now)
      .run();
  } catch {
    return json({ error: "同じプロジェクトIDが既にあります。" }, 409);
  }
  const allMembers = [...new Set([scope.email, ...members])];
  for (const email of allMembers)
    await env.REPORTS.prepare(
      "INSERT OR IGNORE INTO atlasez_project_memberships (project_id,email,role,joined_at) VALUES (?,?,?,?)",
    )
      .bind(id, email, email === scope.email ? "manager" : "member", now)
      .run();
  return json({ ok: true, slug });
}

async function saveMyProfile(request: Request, env: Env): Promise<Response> {
  const scope = await getMemberProfileScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    avatarUrl?: unknown;
    displayName?: unknown;
    university?: unknown;
    year?: unknown;
    affiliationType?: unknown;
    country?: unknown;
    timezone?: unknown;
    bio?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const avatarUrl = text(payload.avatarUrl, 3_000_000);
  const displayName =
    payload.displayName === undefined ? null : text(payload.displayName, 120);
  const university =
    payload.university === undefined ? null : text(payload.university, 200);
  const year = payload.year === undefined ? null : text(payload.year, 80);
  const affiliationType =
    payload.affiliationType === undefined
      ? null
      : text(payload.affiliationType, 80);
  const country =
    payload.country === undefined ? null : text(payload.country, 120);
  const timezone =
    payload.timezone === undefined ? null : text(payload.timezone, 80);
  const bio = payload.bio === undefined ? null : text(payload.bio, 4_000);
  if (
    avatarUrl &&
    ((!/^https:\/\//i.test(avatarUrl) &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(
        avatarUrl,
      )) ||
      /["'<>]/.test(avatarUrl))
  )
    return json(
      {
        error:
          "プロフィール画像はPNG・JPEG・WebPの画像ファイル、またはhttps://画像URLを指定してください。",
      },
      400,
    );
  if (timezone !== null && !validTimeZone(timezone))
    return json({ error: "タイムゾーンを確認してください。" }, 400);
  const requestsProfileChange = [
    displayName,
    university,
    year,
    affiliationType,
    country,
    timezone,
    bio,
  ].some((value) => value !== null);
  if (requestsProfileChange && !displayName)
    return json({ error: "氏名を入力してください。" }, 400);
  const updatedAt = new Date().toISOString();
  const avatarStatement = env.REPORTS.prepare(
    `INSERT INTO editorial_member_profiles (email, avatar_url, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET avatar_url=excluded.avatar_url,updated_at=excluded.updated_at`,
  ).bind(scope.email, avatarUrl, updatedAt);
  if (!requestsProfileChange) {
    try {
      await avatarStatement.run();
      return json({ ok: true, updatedAt, approvalRequired: false });
    } catch {
      return json({ error: "プロフィール画像を保存できませんでした。" }, 500);
    }
  }

  const requestId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const proposedTimezone = timezone || "Asia/Tokyo";
  const existing = await env.REPORTS.prepare(
    "SELECT id,task_id FROM editorial_member_profile_change_requests WHERE email=? AND status='pending' ORDER BY submitted_at DESC LIMIT 1",
  )
    .bind(scope.email)
    .first<{ id: string; task_id: string | null }>();
  const actualRequestId = existing?.id ?? requestId;
  const actualTaskId = existing?.task_id ?? taskId;
  const taskTitle = `メンバー情報変更の承認：${displayName}`;
  const taskDetails = [
    `申請者: ${scope.email}`,
    `氏名: ${displayName}`,
    `所属: ${university ?? ""}`,
    `学年等: ${year ?? ""}`,
    `所属区分: ${affiliationType ?? ""}`,
    `国・地域: ${country ?? ""}`,
    `タイムゾーン: ${proposedTimezone}`,
    "運営事務局の「メンバー情報の承認」から内容を確認してください。",
  ].join("\n");
  const requestStatements = existing
    ? [
        env.REPORTS.prepare(
          `UPDATE editorial_member_profile_change_requests SET
             proposed_display_name=?,proposed_university=?,proposed_year=?,
             proposed_affiliation_type=?,proposed_country=?,proposed_timezone=?,
             proposed_bio=?,submitted_at=?,review_note=''
           WHERE id=? AND status='pending'`,
        ).bind(
          displayName,
          university ?? "",
          year ?? "",
          affiliationType ?? "",
          country ?? "",
          proposedTimezone,
          bio ?? "",
          updatedAt,
          actualRequestId,
        ),
        env.REPORTS.prepare(
          "UPDATE editorial_tasks SET title=?,details=?,status='open',updated_at=? WHERE id=?",
        ).bind(taskTitle, taskDetails, updatedAt, actualTaskId),
      ]
    : [
        env.REPORTS.prepare(
          `INSERT INTO editorial_member_profile_change_requests
           (id,email,proposed_display_name,proposed_university,proposed_year,
            proposed_affiliation_type,proposed_country,proposed_timezone,proposed_bio,
            status,task_id,submitted_at)
           VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?)`,
        ).bind(
          actualRequestId,
          scope.email,
          displayName,
          university ?? "",
          year ?? "",
          affiliationType ?? "",
          country ?? "",
          proposedTimezone,
          bio ?? "",
          actualTaskId,
          updatedAt,
        ),
        env.REPORTS.prepare(
          `INSERT INTO editorial_tasks
           (id,project_id,subject,assignee_email,title,details,status,due_at,due_timezone,
            reminder_at,reminder_repeat,reminder_email,created_by,created_at,updated_at)
           VALUES (?,'secretariat','member-profile-change',NULL,?,?,'open',NULL,'Asia/Tokyo',NULL,'none',NULL,?,?,?)`,
        ).bind(
          actualTaskId,
          taskTitle,
          taskDetails,
          scope.email,
          updatedAt,
          updatedAt,
        ),
      ];
  try {
    await env.REPORTS.batch([avatarStatement, ...requestStatements]);
  } catch {
    return json({ error: "変更申請を運営事務局へ送れませんでした。" }, 500);
  }
  return json({
    ok: true,
    updatedAt,
    approvalRequired: true,
    requestId: actualRequestId,
  });
}

async function listProfileChangeRequests(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getSecretariatReviewerScope(request, env);
  if (isResponse(scope)) return scope;
  const requestedStatus =
    new URL(request.url).searchParams.get("status") ?? "pending";
  if (!new Set(["pending", "approved", "rejected", "all"]).has(requestedStatus))
    return json({ error: "申請状態を確認してください。" }, 400);
  const where = requestedStatus === "all" ? "" : "WHERE r.status=?";
  const profileStatement = env.REPORTS.prepare(
    `SELECT r.*,COALESCE(p.avatar_url,'') AS avatar_url,
      p.display_name AS current_display_name,p.university AS current_university,
      p.year AS current_year,p.affiliation_type AS current_affiliation_type,
      p.country AS current_country,p.timezone AS current_timezone,p.bio AS current_bio
     FROM editorial_member_profile_change_requests r
     LEFT JOIN editorial_member_profiles p ON p.email=r.email
     ${where}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.submitted_at DESC LIMIT 300`,
  );
  const atlasStatement = env.REPORTS.prepare(
    `SELECT r.*,COALESCE(NULLIF(TRIM(p.display_name),''),r.email) AS display_name,
      COALESCE(p.avatar_url,'') AS avatar_url,COALESCE(pp.internal_bio,'') AS current_internal_bio
     FROM editorial_project_profile_change_requests r
     LEFT JOIN editorial_member_profiles p ON p.email=r.email
     LEFT JOIN editorial_project_member_profiles pp
       ON pp.project_id=r.project_id AND pp.email=r.email
     WHERE r.project_id='atlas' ${requestedStatus === "all" ? "" : "AND r.status=?"}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.submitted_at DESC LIMIT 300`,
  );
  const [result, atlasResult] = await Promise.all([
    requestedStatus === "all"
      ? profileStatement.all<Record<string, unknown>>()
      : profileStatement.bind(requestedStatus).all<Record<string, unknown>>(),
    requestedStatus === "all"
      ? atlasStatement.all<Record<string, unknown>>()
      : atlasStatement.bind(requestedStatus).all<Record<string, unknown>>(),
  ]);
  return json({
    requests: result.results ?? [],
    atlasInternalBioRequests: atlasResult.results ?? [],
    reviewer: scope.email,
  });
}

async function reviewProfileChangeRequest(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const scope = await getSecretariatReviewerScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { action?: unknown; reviewNote?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const action = text(payload.action, 20);
  if (action !== "approve" && action !== "reject")
    return json({ error: "承認または却下を選択してください。" }, 400);
  const row = await env.REPORTS.prepare(
    "SELECT * FROM editorial_member_profile_change_requests WHERE id=?",
  )
    .bind(requestId)
    .first<Record<string, unknown>>();
  if (!row) return json({ error: "変更申請が見つかりません。" }, 404);
  if (row.status !== "pending")
    return json({ error: "この変更申請は既に処理済みです。" }, 409);
  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : "rejected";
  const statements = [
    env.REPORTS.prepare(
      "UPDATE editorial_member_profile_change_requests SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND status='pending'",
    ).bind(
      status,
      scope.email,
      now,
      text(payload.reviewNote, 2_000),
      requestId,
    ),
  ];
  if (action === "approve")
    statements.push(
      env.REPORTS.prepare(
        `INSERT INTO editorial_member_profiles
         (email,display_name,university,year,affiliation_type,country,timezone,bio,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,
           university=excluded.university,year=excluded.year,
           affiliation_type=excluded.affiliation_type,country=excluded.country,
           timezone=excluded.timezone,bio=excluded.bio,updated_at=excluded.updated_at`,
      ).bind(
        row.email,
        row.proposed_display_name,
        row.proposed_university,
        row.proposed_year,
        row.proposed_affiliation_type,
        row.proposed_country,
        row.proposed_timezone,
        row.proposed_bio,
        now,
      ),
    );
  if (row.task_id)
    statements.push(
      env.REPORTS.prepare(
        "UPDATE editorial_tasks SET status='done',updated_at=? WHERE id=?",
      ).bind(now, row.task_id),
    );
  await env.REPORTS.batch(statements);
  return json({ ok: true, status });
}

async function getProjectMemberProfile(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const requestedProject =
    new URL(request.url).searchParams.get("project") ?? "atlas";
  const project = await resolveOperationProject(env, scope, requestedProject);
  if (isResponse(project)) return project;
  const role = await operationProjectRole(env, scope, project.id);
  if (!role)
    return json({ error: "このプロジェクトのメンバーではありません。" }, 403);
  const [memberProfile, projectProfile, latestRequest] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT display_name,avatar_url,university,year
       FROM editorial_member_profiles WHERE email=?`,
    )
      .bind(scope.email)
      .first<Record<string, unknown>>(),
    env.REPORTS.prepare(
      `SELECT internal_bio,updated_at FROM editorial_project_member_profiles
       WHERE project_id=? AND email=?`,
    )
      .bind(project.id, scope.email)
      .first<Record<string, unknown>>(),
    env.REPORTS.prepare(
      `SELECT id,proposed_internal_bio,status,submitted_at,reviewed_at,review_note
       FROM editorial_project_profile_change_requests
       WHERE project_id=? AND email=? ORDER BY submitted_at DESC LIMIT 1`,
    )
      .bind(project.id, scope.email)
      .first<Record<string, unknown>>(),
  ]);
  const assignments = await projectAssignmentLabels(
    env,
    project.id,
    scope.email,
    role,
  );
  const canReview =
    project.id === "atlas"
      ? (await operationProjectRole(env, scope, "secretariat")) === "manager"
      : role === "manager";
  return json({
    email: scope.email,
    project: { ...project, role },
    canReview,
    assignments,
    memberProfile: memberProfile ?? {
      display_name: "",
      avatar_url: "",
      university: "",
      year: "",
    },
    projectProfile: projectProfile ?? { internal_bio: "", updated_at: null },
    profileChangeRequest: latestRequest ?? null,
  });
}

async function saveProjectMemberProfile(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: { projectId?: unknown; internalBio?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  await ensureAtlasMembership(env, scope);
  const requestedProject = text(payload.projectId, 80) || "atlas";
  const project = await resolveOperationProject(env, scope, requestedProject);
  if (isResponse(project)) return project;
  const internalBio = text(payload.internalBio, 4_000);
  const [approved, pending, memberProfile] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT internal_bio FROM editorial_project_member_profiles
       WHERE project_id=? AND email=?`,
    )
      .bind(project.id, scope.email)
      .first<{ internal_bio: string }>(),
    env.REPORTS.prepare(
      `SELECT id,task_id FROM editorial_project_profile_change_requests
       WHERE project_id=? AND email=? AND status='pending'
       ORDER BY submitted_at DESC LIMIT 1`,
    )
      .bind(project.id, scope.email)
      .first<{ id: string; task_id: string | null }>(),
    env.REPORTS.prepare(
      "SELECT display_name FROM editorial_member_profiles WHERE email=?",
    )
      .bind(scope.email)
      .first<{ display_name: string }>(),
  ]);
  if (!pending && internalBio === (approved?.internal_bio ?? ""))
    return json({ ok: true, approvalRequired: false, noChange: true });

  const now = new Date().toISOString();
  const requestId = pending?.id ?? crypto.randomUUID();
  const taskId = pending?.task_id ?? crypto.randomUUID();
  const displayName = memberProfile?.display_name?.trim() || scope.email;
  const taskTitle = `運営内自己紹介変更の承認：${displayName}`;
  const taskDetails = [
    `申請者: ${scope.email}`,
    `プロジェクト: ${project.name}`,
    project.id === "atlas"
      ? "運営事務局の「メンバー情報の承認」から内容を確認してください。"
      : "プロジェクト管理の「運営内自己紹介の承認」から内容を確認してください。",
  ].join("\n");
  const statements = pending
    ? [
        env.REPORTS.prepare(
          `UPDATE editorial_project_profile_change_requests
           SET proposed_internal_bio=?,submitted_at=?,review_note=''
           WHERE id=? AND status='pending'`,
        ).bind(internalBio, now, requestId),
        env.REPORTS.prepare(
          `UPDATE editorial_tasks SET title=?,details=?,status='open',updated_at=?
           WHERE id=?`,
        ).bind(taskTitle, taskDetails, now, taskId),
      ]
    : [
        env.REPORTS.prepare(
          `INSERT INTO editorial_project_profile_change_requests
           (id,project_id,email,proposed_internal_bio,status,task_id,submitted_at)
           VALUES (?,?,?,?,'pending',?,?)`,
        ).bind(requestId, project.id, scope.email, internalBio, taskId, now),
        env.REPORTS.prepare(
          `INSERT INTO editorial_tasks
           (id,project_id,subject,assignee_email,title,details,status,due_at,due_timezone,
            reminder_at,reminder_repeat,reminder_email,created_by,created_at,updated_at)
           VALUES (?,?, 'project-profile-change',NULL,?,?,'open',NULL,'Asia/Tokyo',
            NULL,'none',NULL,?,?,?)`,
        ).bind(
          taskId,
          project.id,
          taskTitle,
          taskDetails,
          scope.email,
          now,
          now,
        ),
      ];
  try {
    await env.REPORTS.batch(statements);
  } catch {
    return json(
      { error: "変更申請をプロジェクトの運営へ送れませんでした。" },
      500,
    );
  }
  return json({
    ok: true,
    approvalRequired: true,
    requestId,
    taskId,
    submittedAt: now,
  });
}

async function listProjectIntroductions(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const requestedProject =
    new URL(request.url).searchParams.get("project") ?? "atlas";
  const project = await resolveOperationProject(env, scope, requestedProject);
  if (isResponse(project)) return project;
  const members = await env.REPORTS.prepare(
    `SELECT m.email,m.role,
      COALESCE(NULLIF(TRIM(p.display_name),''),'表示名未設定') AS display_name,
      COALESCE(p.university,'') AS university,COALESCE(p.year,'') AS year,
      COALESCE(p.avatar_url,'') AS avatar_url,
      COALESCE(pp.internal_bio,'') AS internal_bio,pp.updated_at
     FROM atlasez_project_memberships m
     LEFT JOIN editorial_member_profiles p ON p.email=m.email
     LEFT JOIN editorial_project_member_profiles pp
       ON pp.project_id=m.project_id AND pp.email=m.email
     WHERE m.project_id=?
     ORDER BY display_name,m.email`,
  )
    .bind(project.id)
    .all<Record<string, unknown>>();
  const entries = await Promise.all(
    (members.results ?? []).map(async (member) => ({
      ...member,
      assignments: await projectAssignmentLabels(
        env,
        project.id,
        String(member.email ?? ""),
        String(member.role ?? "member"),
      ),
    })),
  );
  return json({ project, entries });
}

async function listProjectProfileChangeRequests(
  request: Request,
  env: Env,
): Promise<Response> {
  const parsed = new URL(request.url);
  const requestedProject = parsed.searchParams.get("project") ?? "atlas";
  const reviewer = await getProjectReviewerScope(
    request,
    env,
    requestedProject,
  );
  if (isResponse(reviewer)) return reviewer;
  const requestedStatus = parsed.searchParams.get("status") ?? "pending";
  if (!new Set(["pending", "approved", "rejected", "all"]).has(requestedStatus))
    return json({ error: "申請状態を確認してください。" }, 400);
  const statusFilter = requestedStatus === "all" ? "" : "AND r.status=?";
  const statement = env.REPORTS.prepare(
    `SELECT r.*,COALESCE(NULLIF(TRIM(p.display_name),''),r.email) AS display_name,
      COALESCE(pp.internal_bio,'') AS current_internal_bio
     FROM editorial_project_profile_change_requests r
     LEFT JOIN editorial_member_profiles p ON p.email=r.email
     LEFT JOIN editorial_project_member_profiles pp
       ON pp.project_id=r.project_id AND pp.email=r.email
     WHERE r.project_id=? ${statusFilter}
     ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.submitted_at DESC
     LIMIT 300`,
  );
  const result =
    requestedStatus === "all"
      ? await statement.bind(reviewer.project.id).all<Record<string, unknown>>()
      : await statement
          .bind(reviewer.project.id, requestedStatus)
          .all<Record<string, unknown>>();
  return json({
    project: reviewer.project,
    reviewer: reviewer.scope.email,
    requests: result.results ?? [],
  });
}

async function reviewProjectProfileChangeRequest(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const row = await env.REPORTS.prepare(
    "SELECT * FROM editorial_project_profile_change_requests WHERE id=?",
  )
    .bind(requestId)
    .first<Record<string, unknown>>();
  if (!row) return json({ error: "変更申請が見つかりません。" }, 404);
  let project: OperationProject;
  const isAtlasSecretariatReviewer =
    String(row.project_id ?? "") === "atlas" &&
    (await operationProjectRole(env, scope, "secretariat")) === "manager";
  if (isAtlasSecretariatReviewer) {
    const atlasProject = await env.REPORTS.prepare(
      "SELECT id,slug,name,description FROM atlasez_projects WHERE id='atlas' OR slug='atlas' LIMIT 1",
    ).first<OperationProject>();
    if (!atlasProject)
      return json({ error: "指定したプロジェクトが見つかりません。" }, 404);
    project = atlasProject;
  } else {
    const resolvedProject = await resolveOperationProject(
      env,
      scope,
      String(row.project_id ?? ""),
    );
    if (isResponse(resolvedProject)) return resolvedProject;
    const role = await operationProjectRole(env, scope, resolvedProject.id);
    if (role !== "manager")
      return json(
        { error: "このプロジェクトの運営内運営のみ利用できます。" },
        403,
      );
    project = resolvedProject;
  }
  if (row.status !== "pending")
    return json({ error: "この変更申請は既に処理済みです。" }, 409);
  let payload: { action?: unknown; reviewNote?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const action = text(payload.action, 20);
  if (action !== "approve" && action !== "reject")
    return json({ error: "承認または却下を選択してください。" }, 400);
  const now = new Date().toISOString();
  const status = action === "approve" ? "approved" : "rejected";
  const statements = [
    env.REPORTS.prepare(
      `UPDATE editorial_project_profile_change_requests
       SET status=?,reviewed_by=?,reviewed_at=?,review_note=?
       WHERE id=? AND status='pending'`,
    ).bind(
      status,
      scope.email,
      now,
      text(payload.reviewNote, 2_000),
      requestId,
    ),
  ];
  if (action === "approve")
    statements.push(
      env.REPORTS.prepare(
        `INSERT INTO editorial_project_member_profiles
         (project_id,email,internal_bio,updated_at) VALUES (?,?,?,?)
         ON CONFLICT(project_id,email) DO UPDATE SET
           internal_bio=excluded.internal_bio,updated_at=excluded.updated_at`,
      ).bind(project.id, row.email, row.proposed_internal_bio, now),
    );
  if (row.task_id)
    statements.push(
      env.REPORTS.prepare(
        "UPDATE editorial_tasks SET status='done',updated_at=? WHERE id=?",
      ).bind(now, row.task_id),
    );
  await env.REPORTS.batch(statements);
  return json({ ok: true, status });
}

async function listApplications(request: Request, env: Env): Promise<Response> {
  const requestedProject =
    new URL(request.url).searchParams.get("project")?.trim().toLowerCase() ?? "";
  if (!APPLICATION_FORM_SLUGS.has(requestedProject))
    return json(
      { error: "応募管理を表示するプロジェクトを指定してください。" },
      400,
    );
  const access = await getProjectReviewerScope(request, env, requestedProject);
  if (isResponse(access)) return access;
  const projectSlug = canonicalApplicationProjectSlug(access.project.slug);
  const rows = await env.REPORTS.prepare(
    `SELECT a.id,a.name,a.email,a.affiliation_email,a.family_name,a.given_name,a.middle_name,a.nickname,a.family_name_kana,a.given_name_kana,a.form_language,a.interests,a.message,a.status,a.created_at,a.updated_at,a.project_slug,a.project_answers,
      a.affiliation_type,a.institution,a.grade,a.country,a.timezone,
      a.birth_date,a.residence_city,a.current_organizations,a.referral_source,a.motivation_reasons,a.desired_roles,a.interview_availability,a.applicant_questions,
      a.desired_subjects,a.article_ideas,a.availability_note,a.provisioning_status,a.provisioning_error,a.provisioned_at,a.accepted_by,
      a.provisioning_attempt_count,a.provisioning_next_attempt_at,a.provisioning_last_attempt_at,
      COALESCE(d.discord_user_id, '') AS verified_discord_user_id,
      COALESCE(d.oauth_connected_at, '') AS discord_oauth_connected_at,
      COALESCE(d.oauth_scope, '') AS discord_oauth_scope
     FROM atlasez_member_applications a
     LEFT JOIN atlasez_member_discord_accounts d ON d.email = a.email
     WHERE a.project_slug = ?
     ORDER BY CASE a.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,a.created_at DESC LIMIT 300`,
  )
    .bind(projectSlug)
    .all<Record<string, unknown>>();
  return json({
    project: { slug: projectSlug, name: access.project.name },
    applications: rows.results,
    subjectLabels: APPLICATION_SUBJECT_LABELS,
    formLabels: APPLICATION_FORM_LABELS,
  });
}

async function updateApplication(
  request: Request,
  env: Env,
  id: string,
  ctx?: WorkerExecutionContext,
): Promise<Response> {
  const requestedProject =
    new URL(request.url).searchParams.get("project")?.trim().toLowerCase() ?? "";
  if (!APPLICATION_FORM_SLUGS.has(requestedProject))
    return json(
      { error: "応募管理を表示するプロジェクトを指定してください。" },
      400,
    );
  const access = await getProjectReviewerScope(request, env, requestedProject);
  if (isResponse(access)) return access;
  const scope = access.scope;
  const applicationProjectSlug = canonicalApplicationProjectSlug(
    access.project.slug,
  );
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    status?: unknown;
    reminderAction?: unknown;
    reminders?: unknown;
    reminderEmail?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const status = text(payload.status, 20);
  if (!["new", "reviewing", "accepted", "rejected"].includes(status))
    return json({ error: "状態を確認してください。" }, 400);
  const application = await env.REPORTS.prepare(
    `SELECT name,nickname,email,status,project_slug,family_name,given_name,middle_name,family_name_kana,given_name_kana,form_language,institution,grade,affiliation_type,country,timezone,desired_subjects,availability_note
     FROM atlasez_member_applications WHERE id=? AND project_slug=?`,
  )
    .bind(id, applicationProjectSlug)
    .first<{
      name: string;
      nickname: string;
      email: string;
      status: string;
      project_slug: string;
      family_name: string;
      given_name: string;
      middle_name: string;
      family_name_kana: string;
      given_name_kana: string;
      form_language: string;
      institution: string;
      grade: string;
      affiliation_type: string;
      country: string;
      timezone: string;
      desired_subjects: string;
      availability_note: string;
    }>();
  if (!application) return json({ error: "応募が見つかりません。" }, 404);
  if (application.status === "accepted" && status !== "accepted")
    return json(
      {
        error:
          "登録済み運営者との不整合を防ぐため、受入済み応募の状態は戻せません。権限変更は運営者・担当管理から行ってください。",
      },
      409,
    );
  const now = new Date().toISOString();
  if (status !== "accepted") {
    await env.REPORTS.prepare(
      "UPDATE atlasez_member_applications SET status=?,updated_at=? WHERE id=?",
    )
      .bind(status, now, id)
      .run();
    return json({ ok: true, status });
  }

  // 旧形式の応募は追加列が空でも受入可能にし、自由記述から権限を推測しない。
  const subjects = [
    ...new Set(
      application.desired_subjects
        .split(",")
        .map((value) => value.trim())
        .filter((value) => APPLICATION_SUBJECT_LABELS[value]),
    ),
  ];
  const projectSlug = APPLICATION_FORM_SLUGS.has(application.project_slug)
    ? application.project_slug
    : "atlas";
  const membershipProjectId =
    projectSlug === "seminar-platform" ? "semi-platform" : projectSlug;
  const interestLabels = subjects
    .map((subject) => APPLICATION_SUBJECT_LABELS[subject])
    .filter(Boolean);
  const affiliationType = normalizeAffiliationType(
    application.affiliation_type,
  );
  const institution = normalizeInstitution(application.institution);
  const grade = normalizeGrade(application.grade);
  const country = normalizedText(application.country, 100);
  const timezone = validTimeZone(application.timezone)
    ? application.timezone
    : "Asia/Tokyo";
  // Discord IDは応募者入力を信用せず、運営内運営が参加者一覧で確認・登録した値だけを使う。
  const verifiedDiscord = await env.REPORTS.prepare(
    "SELECT discord_user_id FROM atlasez_member_discord_accounts WHERE email = ?",
  )
    .bind(application.email)
    .first<{ discord_user_id: string }>();
  const legalDisplayName =
    [
      application.form_language === "en"
        ? application.given_name
        : application.family_name,
      application.form_language === "en" ? application.middle_name : "",
      application.form_language === "en"
        ? application.family_name
        : application.given_name,
    ]
      .filter(Boolean)
      .join(" ") || application.name;
  const displayName = application.nickname?.trim() || legalDisplayName;
  const statements: D1PreparedStatement[] = [
    env.REPORTS.prepare(
      "INSERT INTO atlasez_project_memberships (project_id,email,role,joined_at) VALUES (?,?,'member',?) ON CONFLICT(project_id,email) DO NOTHING",
    ).bind(membershipProjectId, application.email, now),
    env.REPORTS.prepare(
      `INSERT INTO editorial_member_profiles (email,display_name,availability_note,university,year,interests,affiliation_type,country,timezone,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
       display_name=CASE WHEN trim(editorial_member_profiles.display_name)='' THEN excluded.display_name ELSE editorial_member_profiles.display_name END,
       availability_note=CASE WHEN trim(editorial_member_profiles.availability_note)='' THEN excluded.availability_note ELSE editorial_member_profiles.availability_note END,
       university=excluded.university,year=excluded.year,interests=excluded.interests,affiliation_type=excluded.affiliation_type,
       country=excluded.country,timezone=excluded.timezone,updated_at=excluded.updated_at`,
    ).bind(
      application.email,
      displayName,
      "",
      institution,
      grade,
      interestLabels.join(","),
      affiliationType,
      country,
      timezone,
      now,
    ),
    env.REPORTS.prepare(
      `UPDATE atlasez_member_applications SET status='accepted',provisioning_status=?,provisioning_error='',accepted_by=?,updated_at=? WHERE id=?`,
    ).bind(verifiedDiscord ? "pending" : "skipped", scope.email, now, id),
  ];
  // D1 batchは一括トランザクション。所属・プロフィール・応募状態の一部だけが残るのを防ぐ。
  try {
    await env.REPORTS.batch(statements);
  } catch {
    return json(
      {
        error: "運営者登録を完了できませんでした。データは変更されていません。",
      },
      500,
    );
  }

  const discord = await provisionAcceptedApplication(env, id);
  let acceptanceEmailQueued = false;
  try {
    await queueApplicationAcceptanceEmail(
      env,
      {
        id,
        email: application.email,
        projectSlug,
        formLanguage: application.form_language,
      },
      now,
    );
    acceptanceEmailQueued = true;
    ctx?.waitUntil(dispatchApplicationEmails(env));
  } catch (emailError) {
    console.error("application acceptance email queue failed", {
      applicationId: id,
      error: emailError,
    });
  }
  return json({
    ok: true,
    status: "accepted",
    provisioning: discord,
    legacyApplication: !subjects.length,
    acceptanceEmailQueued,
  });
}

async function retryApplicationDiscordProvisioning(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const requestedProject =
    new URL(request.url).searchParams.get("project")?.trim().toLowerCase() ?? "";
  if (!APPLICATION_FORM_SLUGS.has(requestedProject))
    return json({ error: "応募管理を表示するプロジェクトを指定してください。" }, 400);
  const access = await getProjectReviewerScope(request, env, requestedProject);
  if (isResponse(access)) return access;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const application = await env.REPORTS.prepare(
    "SELECT status,project_slug FROM atlasez_member_applications WHERE id=?",
  )
    .bind(id)
    .first<{ status: string; project_slug: string }>();
  if (!application || application.project_slug !== canonicalApplicationProjectSlug(access.project.slug))
    return json({ error: "応募が見つかりません。" }, 404);
  if (application.status !== "accepted")
    return json({ error: "受入済みの応募だけDiscord情報の確認を再試行できます。" }, 409);
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `UPDATE atlasez_member_applications
        SET provisioning_status='pending',provisioning_error='',provisioning_next_attempt_at=NULL,updated_at=?
      WHERE id=? AND status='accepted'`,
  )
    .bind(now, id)
    .run();
  const provisioning = await provisionAcceptedApplication(env, id);
  if (provisioning.status === "synced") return json({ ok: true, provisioning });
  if (provisioning.status === "skipped") return json({ ok: true, provisioning });
  return json({ error: provisioning.warnings.join(" "), provisioning }, 502);
}
async function operationsOverview(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const requestedProject =
    new URL(request.url).searchParams.get("project") ?? "atlas";
  const project = await resolveOperationProject(env, scope, requestedProject);
  if (isResponse(project)) return project;
  const projectRole = await operationProjectRole(env, scope, project.id);
  const canSeeAllProjectOperations =
    scope.allSubjects || projectRole === "manager";
  const filters = canSeeAllProjectOperations
    ? ["project_id = ?"]
    : [
        "project_id = ? AND (lower(assignee_email) = lower(?) OR instr(',' || lower(COALESCE(assignee_email,'')) || ',', ',' || lower(?) || ',') > 0 OR (task_kind = 'feedback' AND assignee_email = '*') OR created_by = ? OR subject IS NULL" +
          (scope.subjects.length
            ? ` OR subject IN (${scope.subjects.map(() => "?").join(",")})`
            : "") +
          ")",
      ];
  const values: unknown[] = canSeeAllProjectOperations
    ? [project.id]
    : [project.id, scope.email, scope.email, scope.email, ...scope.subjects];
  const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
  const memberWhere = canSeeAllProjectOperations
    ? ""
    : ` WHERE subject = '*' OR subject IN (${scope.subjects.map(() => "?").join(",")})`;
  const memberValues: unknown[] = canSeeAllProjectOperations
    ? []
    : scope.subjects;
  const [tasks, events, progress, members, availability, availabilityBlocks] =
    await Promise.all([
      env.REPORTS.prepare(
        `SELECT id, project_id, subject, assignee_email, task_kind, title, details, status, due_at, due_timezone, reminder_at, reminder_repeat, reminder_email, created_by, created_at, updated_at FROM editorial_tasks${where} ORDER BY status = 'done', CASE WHEN due_at IS NULL OR due_at = '' THEN 1 ELSE 0 END, due_at ASC, updated_at DESC LIMIT 200`,
      )
        .bind(...values)
        .all(),
      env.REPORTS.prepare(
        `SELECT id, project_id, subject, title, details, starts_at, ends_at, timezone, created_by, created_at FROM editorial_events WHERE project_id = ? ORDER BY starts_at ASC LIMIT 60`,
      )
        .bind(project.id)
        .all<{
          id: string;
          project_id: string;
          subject: string | null;
          title: string;
          details: string;
          starts_at: string;
          ends_at: string | null;
          timezone: string;
          created_by: string;
          created_at: string;
        }>(),
      env.REPORTS.prepare(
        "SELECT id,email,subject,document_id,body,created_at FROM editorial_progress_reports WHERE project_id = ? AND email = ? ORDER BY created_at DESC LIMIT 30",
      )
        .bind(project.id, scope.email)
        .all(),
      env.REPORTS.prepare(
        `SELECT DISTINCT p.email, COALESCE(NULLIF(TRIM(profile.display_name), ''), '表示名未設定') AS display_name FROM report_admin_permissions p LEFT JOIN editorial_member_profiles profile ON profile.email = p.email${memberWhere.replaceAll("subject", "p.subject")} ORDER BY display_name, p.email`,
      )
        .bind(...memberValues)
        .all<{ email: string; display_name: string }>(),
      env.REPORTS.prepare(
        "SELECT a.event_id, a.email, a.availability, CASE WHEN p.display_name IS NULL OR trim(p.display_name) = '' OR lower(trim(p.display_name)) = lower(a.email) THEN '表示名未設定' ELSE trim(p.display_name) END AS display_name FROM editorial_event_availability a JOIN editorial_events e ON e.id = a.event_id AND e.project_id = ? LEFT JOIN editorial_member_profiles p ON p.email = a.email",
      )
        .bind(project.id)
        .all<{
          event_id: string;
          email: string;
          availability: string;
          display_name: string;
        }>(),
      env.REPORTS.prepare(
        `SELECT b.id, b.email, b.starts_at, b.ends_at, b.timezone,
        CASE WHEN lower(b.email) = lower(?) OR ? = 1 THEN b.label ELSE '' END AS label,
        b.kind, COALESCE(NULLIF(TRIM(p.display_name), ''), '表示名未設定') AS display_name
       FROM editorial_member_availability_blocks b
       LEFT JOIN editorial_member_profiles p ON lower(p.email) = lower(b.email)
       ORDER BY b.starts_at ASC LIMIT 500`,
      )
        .bind(scope.email, scope.isManager ? 1 : 0)
        .all<Record<string, unknown>>(),
    ]);
  const taskRows = (tasks.results ?? []) as Array<Record<string, unknown>>;
  const reminderRows = taskRows.length
    ? await env.REPORTS.prepare(
        `SELECT id,task_id,remind_at,remind_at_utc,timezone,label,notified_at,relative_kind,relative_amount,relative_unit,relative_start
         FROM editorial_task_reminders
         WHERE task_id IN (${taskRows.map(() => "?").join(",")})
         ORDER BY remind_at ASC`,
      )
        .bind(...taskRows.map((task) => task.id))
        .all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  const remindersByTask = new Map<string, Record<string, unknown>[]>();
  for (const reminder of reminderRows.results ?? []) {
    const taskId = String(reminder.task_id ?? "");
    remindersByTask.set(taskId, [
      ...(remindersByTask.get(taskId) ?? []),
      reminder,
    ]);
  }
  const participantRows = availability.results ?? [];
  const participantsByEvent = new Map<string, typeof participantRows>();
  for (const item of participantRows) {
    const rows = participantsByEvent.get(item.event_id) ?? [];
    rows.push(item);
    participantsByEvent.set(item.event_id, rows);
  }
  return json({
    scope: {
      email: scope.email,
      subjects: scope.subjects,
      isManager: scope.isManager,
    },
    project,
    tasks: taskRows.map((task) => ({
      ...task,
      reminder_email:
        scope.isManager ||
        String(task.created_by ?? "").toLowerCase() ===
          scope.email.toLowerCase() ||
        taskAssignedTo(task.assignee_email, scope.email, task.task_kind)
          ? task.reminder_email
          : null,
      reminders: remindersByTask.get(String(task.id)) ?? [],
    })),
    availabilityBlocks: (availabilityBlocks.results ?? []).map((block) => ({
      ...block,
      isSelf:
        String(block.email ?? "").toLowerCase() === scope.email.toLowerCase(),
    })),
    events: (events.results ?? []).map((item) => {
      const participants = participantsByEvent.get(item.id) ?? [];
      return {
        ...item,
        availability:
          participants.find((participant) => participant.email === scope.email)
            ?.availability ?? null,
        availabilityCounts: {
          available: participants.filter(
            (participant) => participant.availability === "available",
          ).length,
          maybe: participants.filter(
            (participant) => participant.availability === "maybe",
          ).length,
          unavailable: participants.filter(
            (participant) => participant.availability === "unavailable",
          ).length,
        },
        participants: participants.map(
          ({
            email: participantEmail,
            display_name,
            availability: participantAvailability,
          }) => ({
            displayName: display_name,
            availability: participantAvailability,
            isSelf: participantEmail === scope.email,
          }),
        ),
      };
    }),
    progress: progress.results,
    members: members.results ?? [],
  });
}

async function progressReportsOverview(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  await ensureAtlasMembership(env, scope);
  const projects = await accessibleOperationProjects(env, scope);
  if (!projects.length)
    return json({
      scope: { email: scope.email, isManager: false },
      projects: [],
      progress: [],
    });

  const conditions: string[] = [];
  const values: unknown[] = [];
  for (const project of projects) {
    if (scope.isManager || project.role === "manager") {
      conditions.push("r.project_id = ?");
      values.push(project.id);
      continue;
    }
    const subjectCondition = scope.subjects.length
      ? ` OR r.subject IN (${scope.subjects.map(() => "?").join(",")})`
      : "";
    conditions.push(
      `(r.project_id = ? AND (lower(r.email) = lower(?) OR r.subject IS NULL${subjectCondition}))`,
    );
    values.push(project.id, scope.email, ...scope.subjects);
  }

  const reports = await env.REPORTS.prepare(
    `SELECT r.id,r.project_id,r.subject,r.document_id,r.body,r.created_at,r.email,
      COALESCE(NULLIF(TRIM(profile.display_name),''),r.email) AS display_name,
      COALESCE(p.name,r.project_id) AS project_name
     FROM editorial_progress_reports r
     LEFT JOIN editorial_member_profiles profile ON lower(profile.email)=lower(r.email)
     LEFT JOIN atlasez_projects p ON p.id=r.project_id
     WHERE ${conditions.join(" OR ")}
     ORDER BY r.created_at DESC`,
  )
    .bind(...values)
    .all<Record<string, unknown>>();
  return json({
    scope: {
      email: scope.email,
      subjects: scope.subjects,
      isManager: scope.isManager,
    },
    projects,
    progress: reports.results ?? [],
  });
}

async function createOperation(
  request: Request,
  env: Env,
  type: "task" | "progress" | "event",
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const now = new Date().toISOString();
  const project = await resolveOperationProject(
    env,
    scope,
    text(payload.projectId, 80) || "atlas",
  );
  if (isResponse(project)) return project;
  const subject = text(payload.subject, 80) || null;
  if (subject && !scope.allSubjects && !scope.subjects.includes(subject))
    return json({ error: "この分野を指定する権限がありません。" }, 403);
  if (type === "progress") {
    const body = text(payload.body, MAX_OPERATION_TEXT_LENGTH);
    if (!body) return json({ error: "進捗内容を入力してください。" }, 400);
    await env.REPORTS.prepare(
      "INSERT INTO editorial_progress_reports (id,email,subject,document_id,body,created_at,project_id) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        scope.email,
        subject,
        text(payload.documentId, 64) || null,
        body,
        now,
        project.id,
      )
      .run();
    if (project.slug === "atlas")
      await notifyProgressToDiscord(env, subject, body);
    return json({
      ok: true,
      discordNotified: Boolean(
        env.DISCORD_ATLAS_WEBHOOK_URL || env.DISCORD_PROGRESS_WEBHOOK_URL,
      ),
    });
  }
  if (type === "task") {
    const title = text(payload.title, 200);
    if (!title) return json({ error: "タスク名を入力してください。" }, 400);
    const assignees = normalizedTaskAssignees(
      payload.assigneeEmails,
      payload.assigneeEmail,
    );
    if (assignees.some((email) => !EMAIL_PATTERN.test(email)))
      return json({ error: "担当者のメールアドレスを確認してください。" }, 400);
    if (
      assignees.length &&
      !scope.isManager &&
      assignees.some((email) => email !== scope.email.toLowerCase())
    )
      return json(
        { error: "他の運営者への依頼は運営内運営のみ作成できます。" },
        403,
      );
    const assignee = assignees.length ? assignees.join(",") : null;
    const dueAt = text(payload.dueAt, 32);
    const dueTimezone = text(payload.dueTimezone, 80) || "Asia/Tokyo";
    const legacyReminderAt = text(payload.reminderAt, 32);
    const reminderRepeat = text(payload.reminderRepeat, 12) || "none";
    const reminderEmail = text(payload.reminderEmail, 254).toLowerCase();
    const reminderPayload = Array.isArray(payload.reminders)
      ? payload.reminders
      : [];
    const reminderRowsResult = reminderInputRows(
      reminderPayload,
      dueAt,
      dueTimezone,
    );
    if (reminderRowsResult.error)
      return json({ error: reminderRowsResult.error }, 400);
    const reminderRows = reminderRowsResult.rows ?? [];
    for (const reminder of reminderRows) {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminder.remindAt) ||
        !validTimeZone(reminder.timezone) ||
        !new Set(["none", "once", "daily", "weekly", "monthly"]).has(
          reminder.repeat,
        )
      )
        return json(
          { error: "リマインダー日時またはタイムゾーンを確認してください。" },
          400,
        );
    }
    if (!reminderRows.length && legacyReminderAt)
      reminderRows.push({
        remindAt: legacyReminderAt,
        timezone: dueTimezone,
        label: reminderRepeat === "none" ? "リマインダー" : reminderRepeat,
        repeat: reminderRepeat,
        relativeKind: "absolute",
        relativeAmount: null,
        relativeUnit: null,
        relativeStart: null,
      });
    if (dueAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dueAt))
      return json({ error: "期限はカレンダーから指定してください。" }, 400);
    if (dueAt && !validTimeZone(dueTimezone))
      return json({ error: "期限のタイムゾーンを確認してください。" }, 400);
    if (dueAt && !Number.isFinite(wallTimeToEpoch(dueAt, dueTimezone)))
      return json({ error: "期限が存在しない日時です。" }, 400);
    if (reminderEmail && !EMAIL_PATTERN.test(reminderEmail))
      return json({ error: "通知先メールアドレスを確認してください。" }, 400);
    if (
      reminderEmail &&
      reminderEmail !== scope.email &&
      !assignees.includes(reminderEmail)
    )
      return json(
        {
          error:
            "リマインダーの通知先は担当者または自分のメールアドレスにしてください。",
        },
        403,
      );
    if (
      !new Set(["none", "once", "daily", "weekly", "monthly"]).has(
        reminderRepeat,
      )
    )
      return json({ error: "リマインダーの繰り返しを確認してください。" }, 400);
    for (const reminder of reminderRows) {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminder.remindAt) ||
        !validTimeZone(reminder.timezone) ||
        !new Set(["none", "once", "daily", "weekly", "monthly"]).has(
          reminder.repeat,
        )
      )
        return json(
          { error: "リマインダー日時またはタイムゾーンを確認してください。" },
          400,
        );
      if (
        !Number.isFinite(wallTimeToEpoch(reminder.remindAt, reminder.timezone))
      )
        return json({ error: "リマインダーが存在しない日時です。" }, 400);
    }
    if (reminderRows.length > 1 && reminderRepeat !== "none")
      return json(
        {
          error:
            "複数のリマインダーを設定する場合、繰り返しは「1回」にしてください。",
        },
        400,
      );
    const taskId = crypto.randomUUID();
    const singleRepeatingReminder =
      reminderRows.length === 1 && reminderRepeat !== "none";
    const taskStatements = [
      env.REPORTS.prepare(
        "INSERT INTO editorial_tasks (id,project_id,subject,assignee_email,title,details,status,due_at,due_timezone,reminder_at,reminder_repeat,reminder_email,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?)",
      ).bind(
        taskId,
        project.id,
        subject,
        assignee,
        title,
        text(payload.details, MAX_OPERATION_TEXT_LENGTH),
        dueAt || null,
        dueTimezone,
        reminderRows.length ? null : legacyReminderAt || null,
        singleRepeatingReminder
          ? reminderRepeat
          : reminderRows.length
            ? "none"
            : reminderRepeat,
        reminderEmail || null,
        scope.email,
        now,
        now,
      ),
      ...reminderRows.map((reminder) =>
        env.REPORTS.prepare(
          "INSERT INTO editorial_task_reminders (id,task_id,remind_at,remind_at_utc,timezone,label,relative_kind,relative_amount,relative_unit,relative_start,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          taskId,
          reminder.remindAt,
          new Date(
            wallTimeToEpoch(reminder.remindAt, reminder.timezone),
          ).toISOString(),
          reminder.timezone,
          reminder.label,
          reminder.relativeKind,
          reminder.relativeAmount,
          reminder.relativeUnit,
          reminder.relativeStart,
          now,
        ),
      ),
    ];
    await env.REPORTS.batch(taskStatements);
    return json({ ok: true });
  }
  const title = text(payload.title, 200);
  const startsAt = text(payload.startsAt, 40),
    timezone = text(payload.timezone, 80) || "Asia/Tokyo";
  if (!title || !startsAt)
    return json({ error: "催し名と日時を入力してください。" }, 400);
  if (!scope.isManager)
    return json({ error: "日程の作成は運営内運営のみ行えます。" }, 403);
  await env.REPORTS.prepare(
    "INSERT INTO editorial_events (id,project_id,subject,title,details,starts_at,ends_at,timezone,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      project.id,
      subject,
      title,
      text(payload.details, MAX_OPERATION_TEXT_LENGTH),
      startsAt,
      text(payload.endsAt, 40) || null,
      timezone,
      scope.email,
      now,
    )
    .run();
  return json({ ok: true });
}

async function updateTask(
  request: Request,
  env: Env,
  taskId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    status?: unknown;
    reminderAction?: unknown;
    reminders?: unknown;
    reminderEmail?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const requestedStatus =
    payload.status === undefined ? null : text(payload.status, 20);
  const reminderAction = text(payload.reminderAction, 30);
  if (requestedStatus !== null && !taskStatus.has(requestedStatus))
    return json({ error: "状態を確認してください。" }, 400);
  if (reminderAction && reminderAction !== "replace")
    return json({ error: "リマインダーの更新方法を確認してください。" }, 400);
  if (requestedStatus === null && !reminderAction)
    return json({ error: "更新内容を指定してください。" }, 400);
  const task = await env.REPORTS.prepare(
    "SELECT project_id,subject,assignee_email,task_kind,created_by,due_at,due_timezone FROM editorial_tasks WHERE id=?",
  )
    .bind(taskId)
    .first<{
      project_id: string;
      subject: string | null;
      assignee_email: string | null;
      task_kind: string;
      created_by: string;
      due_at: string | null;
      due_timezone: string;
    }>();
  if (!task) return json({ error: "タスクが見つかりません。" }, 404);
  const project = await resolveOperationProject(env, scope, task.project_id);
  if (isResponse(project)) return project;
  if (
    !scope.isManager &&
    !taskAssignedTo(task.assignee_email, scope.email, task.task_kind) &&
    task.created_by !== scope.email
  )
    return json({ error: "このタスクを更新する権限がありません。" }, 403);
  const now = new Date().toISOString();
  if (reminderAction === "replace") {
    const reminderEmail = text(payload.reminderEmail, 254).toLowerCase();
    if (reminderEmail && !EMAIL_PATTERN.test(reminderEmail))
      return json({ error: "通知先メールアドレスを確認してください。" }, 400);
    if (
      reminderEmail &&
      reminderEmail !== scope.email &&
      !normalizedTaskAssignees(task.assignee_email).includes(reminderEmail)
    )
      return json(
        {
          error:
            "リマインダーの通知先は担当者または自分のメールアドレスにしてください。",
        },
        403,
      );
    const reminderRowsResult = reminderInputRows(
      Array.isArray(payload.reminders) ? payload.reminders : [],
      task.due_at ?? "",
      task.due_timezone || "Asia/Tokyo",
    );
    if (reminderRowsResult.error)
      return json({ error: reminderRowsResult.error }, 400);
    const reminderRows = reminderRowsResult.rows ?? [];
    for (const reminder of reminderRows) {
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(reminder.remindAt) ||
        !validTimeZone(reminder.timezone) ||
        !new Set(["none", "once", "daily", "weekly", "monthly"]).has(
          reminder.repeat,
        )
      )
        return json(
          { error: "リマインダー日時またはタイムゾーンを確認してください。" },
          400,
        );
      if (
        !Number.isFinite(wallTimeToEpoch(reminder.remindAt, reminder.timezone))
      )
        return json({ error: "リマインダーが存在しない日時です。" }, 400);
    }
    const statements = [
      env.REPORTS.prepare(
        "DELETE FROM editorial_task_reminders WHERE task_id=?",
      ).bind(taskId),
      env.REPORTS.prepare(
        "UPDATE editorial_tasks SET reminder_at=?,reminder_repeat=?,reminder_email=?,updated_at=? WHERE id=?",
      ).bind(
        null,
        reminderRows.length === 1 ? reminderRows[0].repeat : "none",
        reminderEmail || null,
        now,
        taskId,
      ),
    ];
    if (requestedStatus !== null)
      statements.push(
        env.REPORTS.prepare(
          "UPDATE editorial_tasks SET status=?,updated_at=? WHERE id=?",
        ).bind(requestedStatus, now, taskId),
      );
    statements.push(
      ...reminderRows.map((reminder) =>
        env.REPORTS.prepare(
          "INSERT INTO editorial_task_reminders (id,task_id,remind_at,remind_at_utc,timezone,label,relative_kind,relative_amount,relative_unit,relative_start,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          crypto.randomUUID(),
          taskId,
          reminder.remindAt,
          new Date(
            wallTimeToEpoch(reminder.remindAt, reminder.timezone),
          ).toISOString(),
          reminder.timezone,
          reminder.label,
          reminder.relativeKind,
          reminder.relativeAmount,
          reminder.relativeUnit,
          reminder.relativeStart,
          now,
        ),
      ),
    );
    await env.REPORTS.batch(statements);
  } else if (requestedStatus !== null) {
    await env.REPORTS.prepare(
      "UPDATE editorial_tasks SET status=?,updated_at=? WHERE id=?",
    )
      .bind(requestedStatus, now, taskId)
      .run();
  }
  return json({ ok: true });
}

async function updateEventAvailability(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { availability?: unknown; note?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const availability = text(payload.availability, 20);
  if (!availabilityStatus.has(availability))
    return json({ error: "参加可否を確認してください。" }, 400);
  const event = await env.REPORTS.prepare(
    "SELECT project_id FROM editorial_events WHERE id = ?",
  )
    .bind(eventId)
    .first<{ project_id: string }>();
  if (!event) return json({ error: "日程が見つかりません。" }, 404);
  const project = await resolveOperationProject(env, scope, event.project_id);
  if (isResponse(project)) return project;
  await env.REPORTS.prepare(
    `INSERT INTO editorial_event_availability (event_id,email,availability,note,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(event_id,email) DO UPDATE SET availability=excluded.availability,note=excluded.note,updated_at=excluded.updated_at`,
  )
    .bind(
      eventId,
      scope.email,
      availability,
      text(payload.note, 1_000),
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true });
}

async function deleteEvent(
  request: Request,
  env: Env,
  eventId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager)
    return json({ error: "日程の削除は運営内運営のみ行えます。" }, 403);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const event = await env.REPORTS.prepare(
    "SELECT id, project_id FROM editorial_events WHERE id=?",
  )
    .bind(eventId)
    .first<{ id: string; project_id: string }>();
  if (!event) return json({ error: "日程が見つかりません。" }, 404);
  const project = await resolveOperationProject(env, scope, event.project_id);
  if (isResponse(project)) return project;
  await env.REPORTS.batch([
    env.REPORTS.prepare(
      "DELETE FROM editorial_event_availability WHERE event_id=?",
    ).bind(eventId),
    env.REPORTS.prepare("DELETE FROM editorial_events WHERE id=?").bind(
      eventId,
    ),
  ]);
  return json({ ok: true });
}

async function createAvailabilityBlock(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const startsAt = text(payload.startsAt, 40);
  const endsAt = text(payload.endsAt, 40);
  const timezone = text(payload.timezone, 80) || "Asia/Tokyo";
  const kind = text(payload.kind, 20) || "unavailable";
  if (
    !startsAt ||
    !endsAt ||
    new Date(endsAt).getTime() <= new Date(startsAt).getTime()
  )
    return json({ error: "開始・終了日時を確認してください。" }, 400);
  if (!validTimeZone(timezone) || !["available", "unavailable"].includes(kind))
    return json({ error: "タイムゾーンまたは可否を確認してください。" }, 400);
  await env.REPORTS.prepare(
    "INSERT INTO editorial_member_availability_blocks (id,email,starts_at,ends_at,timezone,label,kind,created_at) VALUES (?,?,?,?,?,?,?,?)",
  )
    .bind(
      crypto.randomUUID(),
      scope.email,
      startsAt,
      endsAt,
      timezone,
      text(payload.label, 160),
      kind,
      new Date().toISOString(),
    )
    .run();
  return json({ ok: true });
}

async function deleteAvailabilityBlock(
  request: Request,
  env: Env,
  blockId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  await env.REPORTS.prepare(
    "DELETE FROM editorial_member_availability_blocks WHERE id = ? AND email = ?",
  )
    .bind(blockId, scope.email)
    .run();
  return json({ ok: true });
}

async function submitMemberApplication(
  request: Request,
  env: Env,
  source: "same-origin" | "public-worker" = "same-origin",
  ctx?: WorkerExecutionContext,
): Promise<Response> {
  let authenticatedEmail = "";
  if (source === "public-worker") {
    const configuredToken = env.PUBLIC_APPLICATION_INGEST_TOKEN?.trim();
    const suppliedToken =
      request.headers.get("x-atlasez-application-token") ?? "";
    if (
      !configuredToken ||
      !suppliedToken ||
      configuredToken.length !== suppliedToken.length ||
      ![...configuredToken].every(
        (character, index) => character === suppliedToken[index],
      )
    )
      return json({ error: "応募送信の認証に失敗しました。" }, 401);
  } else {
    if (!isSameOrigin(request))
      return json({ error: "この送信元からは受け付けられません。" }, 403);
    const identity = await getAuthenticatedEmail(request, env);
    if (isResponse(identity)) return identity;
    authenticatedEmail = identity;
    const current = await getUserStageForEmail(
      authenticatedEmail,
      env,
      localDevelopmentEnabled(request, env),
    );
    const canSubmitForAnotherProject = [
      "APPLICANT",
      "ONBOARDING",
      "TUTORIAL",
      "MEMBER",
    ].includes(current.stage);
    if (!canAccess(current.stage, "application") && !canSubmitForAnotherProject)
      return json({ error: "このアカウントでは応募を送信済みです。" }, 409);
  }
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: {
    name?: unknown;
    familyName?: unknown;
    givenName?: unknown;
    middleName?: unknown;
    familyNameKana?: unknown;
    givenNameKana?: unknown;
    nameOrder?: unknown;
    nickname?: unknown;
    formLanguage?: unknown;
    email?: unknown;
    interests?: unknown;
    message?: unknown;
    website?: unknown;
    turnstileToken?: unknown;
    affiliationType?: unknown;
    institution?: unknown;
    grade?: unknown;
    country?: unknown;
    timezone?: unknown;
    desiredSubjects?: unknown;
    articleIdeas?: unknown;
    availabilityNote?: unknown;
    birthDate?: unknown;
    residenceCity?: unknown;
    currentOrganizations?: unknown;
    referralSource?: unknown;
    motivationReasons?: unknown;
    desiredRoles?: unknown;
    interviewAvailability?: unknown;
    applicantQuestions?: unknown;
    affiliationEmail?: unknown;
    projectSlug?: unknown;
    projectAnswers?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const storedProfile = authenticatedEmail
    ? await getApplicantProfile(env, authenticatedEmail)
    : null;
  // 人には見せない入力欄。自動送信ボットの基本的な遮断に使う。
  if (text(payload.website, 200)) return json({ ok: true }, 201);
  const familyName =
      normalizedText(payload.familyName, 80) ||
      storedProfile?.family_name ||
      "",
    givenName =
      normalizedText(payload.givenName, 80) || storedProfile?.given_name || "",
    middleName =
      normalizedText(payload.middleName, 80) ||
      storedProfile?.middle_name ||
      "",
    familyNameKana =
      normalizedText(payload.familyNameKana, 80) ||
      storedProfile?.family_name_kana ||
      "",
    givenNameKana =
      normalizedText(payload.givenNameKana, 80) ||
      storedProfile?.given_name_kana ||
      "",
    formLanguage =
      text(payload.formLanguage, 2) === "en" ||
      (!text(payload.formLanguage, 2) && storedProfile?.form_language === "en")
        ? "en"
        : "ja";
  const nickname =
    normalizedText(payload.nickname, 120) || storedProfile?.nickname || "";
  const legacyName = normalizedText(payload.name, 120),
    requestedNameOrder = text(payload.nameOrder, 20),
    nameOrder =
      requestedNameOrder === "given-family" ||
      (requestedNameOrder === "" && formLanguage === "en")
        ? "given-family"
        : "family-given",
    name =
      familyName && givenName
        ? (nameOrder === "given-family"
            ? [givenName, formLanguage === "en" ? middleName : "", familyName]
            : [familyName, formLanguage === "en" ? middleName : "", givenName]
          )
            .filter(Boolean)
            .join(" ")
        : legacyName,
    submittedEmail = text(payload.email, 320).toLowerCase(),
    email = authenticatedEmail || submittedEmail,
    interests = normalizedText(payload.interests, 1_000),
    message = text(payload.message, MAX_OPERATION_TEXT_LENGTH);
  const affiliationType =
      normalizeAffiliationType(payload.affiliationType) ||
      storedProfile?.affiliation_type ||
      "",
    affiliationEmail =
      normalizedText(payload.affiliationEmail, 320).toLowerCase() ||
      storedProfile?.affiliation_email ||
      "",
    institution =
      normalizeInstitution(payload.institution) ||
      storedProfile?.institution ||
      "",
    grade = normalizeGrade(payload.grade) || storedProfile?.grade || "";
  const country =
      normalizedText(payload.country, 100) || storedProfile?.country || "",
    timezone =
      normalizedText(payload.timezone, 80) || storedProfile?.timezone || "",
    articleIdeas = text(payload.articleIdeas, 3_000),
    availabilityNote = text(payload.availabilityNote, 1_000),
    birthDate = text(payload.birthDate, 10) || storedProfile?.birth_date || "",
    residenceCity =
      normalizedText(payload.residenceCity, 160) ||
      storedProfile?.residence_city ||
      "",
    currentOrganizations =
      text(payload.currentOrganizations, 1_000) ||
      storedProfile?.current_organizations ||
      "",
    referralSource = text(payload.referralSource, 500),
    motivationReasons = text(payload.motivationReasons, 3_000),
    desiredRoles = text(payload.desiredRoles, 2_000),
    interviewAvailability = text(payload.interviewAvailability, 2_000),
    applicantQuestions = text(payload.applicantQuestions, 3_000);
  const requestedProjectSlug = text(payload.projectSlug, 60) || "atlas";
  if (
    authenticatedEmail &&
    submittedEmail &&
    submittedEmail !== authenticatedEmail
  )
    return json(
      { error: "Googleログイン中のメールアドレスで応募してください。" },
      403,
    );
  if (!APPLICATION_FORM_SLUGS.has(requestedProjectSlug))
    return json({ error: "応募フォームの種類を確認してください。" }, 400);
  const projectSlug = requestedProjectSlug;
  const projectAnswerRecord: Record<string, string> = {};
  if (
    payload.projectAnswers &&
    typeof payload.projectAnswers === "object" &&
    !Array.isArray(payload.projectAnswers)
  ) {
    for (const [key, value] of Object.entries(
      payload.projectAnswers as Record<string, unknown>,
    )) {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/.test(key)) continue;
      const answer = text(value, 4_000);
      if (answer) projectAnswerRecord[key] = answer;
    }
  }
  const projectAnswers = JSON.stringify(projectAnswerRecord);
  const desiredSubjectSlugs = [
    ...new Set(
      Array.isArray(payload.desiredSubjects)
        ? payload.desiredSubjects
            .map((v) => text(v, 80))
            .filter((v) => APPLICATION_SUBJECT_LABELS[v])
        : [],
    ),
  ];
  const needsMotivationAndRole = projectSlug !== "thinking-cafe";
  const needsArticleIdeas =
    projectSlug === "atlas" || projectSlug === "seminar-platform";
  const requiredProjectAnswers: Record<string, string[]> = {
    "thinking-cafe": ["theme"],
    "student-council-exchange": [
      "councilStatus",
      "councilRole",
      "councilPlans",
    ],
    secretariat: ["strengths", "problemAwareness", "plans"],
  };
  const missingProjectAnswer = (requiredProjectAnswers[projectSlug] ?? []).some(
    (key) => !projectAnswerRecord[key],
  );
  if (
    !name ||
    !EMAIL_PATTERN.test(email) ||
    !interests ||
    !message ||
    !EMAIL_PATTERN.test(affiliationEmail) ||
    !affiliationType ||
    !institution ||
    !grade ||
    !country ||
    !timezone ||
    (needsArticleIdeas && !articleIdeas) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
    !residenceCity ||
    !referralSource ||
    (needsMotivationAndRole && (!motivationReasons || !desiredRoles)) ||
    !interviewAvailability ||
    (projectSlug === "atlas" && !desiredSubjectSlugs.length) ||
    missingProjectAnswer
  )
    return json(
      {
        error: "基本情報、希望分野、書きたい記事、参加理由を入力してください。",
      },
      400,
    );
  if (
    formLanguage === "ja" &&
    (!familyName || !givenName || !familyNameKana || !givenNameKana)
  )
    return json({ error: "姓・名・ふりがなを入力してください。" }, 400);
  if (
    !(MEMBER_AFFILIATION_TYPES as readonly string[]).includes(affiliationType)
  )
    return json({ error: "所属区分を一覧から選択してください。" }, 400);
  if (
    !(MEMBER_YEARS as readonly string[]).includes(grade) ||
    !(APPLICATION_GRADES_BY_AFFILIATION[affiliationType] ?? []).includes(grade)
  )
    return json(
      { error: "所属区分に対応する学年・立場を選択してください。" },
      400,
    );
  if (!validTimeZone(timezone))
    return json({ error: "タイムゾーンを一覧から選択してください。" }, 400);
  const rateLimitScope =
    source === "public-worker" ? "public" : "authenticated";
  const clientKey = await hash(
    `${rateLimitScope}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
  );
  const bucket = Math.floor(Date.now() / 600000);
  const applicationId = crypto.randomUUID();
  await env.REPORTS.prepare(
    "INSERT INTO atlasez_application_rate_limits (client_key,bucket,count,updated_at) VALUES (?,?,1,?) ON CONFLICT(client_key,bucket) DO UPDATE SET count=count+1,updated_at=excluded.updated_at",
  )
    .bind(clientKey, bucket, new Date().toISOString())
    .run();
  const limit = await env.REPORTS.prepare(
    "SELECT count FROM atlasez_application_rate_limits WHERE client_key=? AND bucket=?",
  )
    .bind(clientKey, bucket)
    .first<{ count: number }>();
  const maxApplicationsPerIpBucket =
    source === "public-worker"
      ? APPLICATION_RATE_LIMITS.publicWorker
      : APPLICATION_RATE_LIMITS.authenticated;
  if ((limit?.count ?? 0) > maxApplicationsPerIpBucket)
    return json(
      {
        error:
          "短時間に送信できる回数を超えました。10分ほど待ってから再度お試しください。",
      },
      429,
    );
  if (env.TURNSTILE_SECRET_KEY) {
    const token = text(payload.turnstileToken, 2_500);
    if (!token)
      return json({ error: "人による操作の確認を完了してください。" }, 400);
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
        }),
      },
    );
    const result = (await verification.json()) as { success?: boolean };
    if (!result.success)
      return json(
        { error: "人による操作の確認に失敗しました。もう一度お試しください。" },
        400,
      );
  }
  const duplicate = await env.REPORTS.prepare(
    "SELECT id FROM atlasez_member_applications WHERE lower(email)=lower(?) AND project_slug=? AND status IN ('new','reviewing') LIMIT 1",
  )
    .bind(email, projectSlug)
    .first<{ id: string }>();
  if (duplicate)
    return json(
      {
        error:
          "このメールアドレスの応募はすでに確認中です。結果の連絡をお待ちください。",
      },
      409,
    );
  const now = new Date().toISOString();
  if (authenticatedEmail) {
    await env.REPORTS.prepare(
      `INSERT INTO atlasez_applicant_profiles
        (email,family_name,given_name,middle_name,nickname,family_name_kana,given_name_kana,form_language,
         affiliation_email,affiliation_type,institution,grade,country,timezone,birth_date,residence_city,
         current_organizations,referral_source,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET
         family_name=excluded.family_name,given_name=excluded.given_name,middle_name=excluded.middle_name,
         nickname=excluded.nickname,
         family_name_kana=excluded.family_name_kana,given_name_kana=excluded.given_name_kana,
         form_language=excluded.form_language,affiliation_type=excluded.affiliation_type,
         affiliation_email=excluded.affiliation_email,
         institution=excluded.institution,grade=excluded.grade,country=excluded.country,
         timezone=excluded.timezone,birth_date=excluded.birth_date,residence_city=excluded.residence_city,
         current_organizations=excluded.current_organizations,referral_source=excluded.referral_source,
         updated_at=excluded.updated_at`,
    )
      .bind(
        authenticatedEmail,
        familyName,
        givenName,
        middleName,
        nickname,
        familyNameKana,
        givenNameKana,
        formLanguage,
        affiliationEmail,
        affiliationType,
        institution,
        grade,
        country,
        timezone,
        birthDate,
        residenceCity,
        currentOrganizations,
        referralSource,
        now,
        now,
      )
      .run();
  }
  await env.REPORTS.prepare(
    `INSERT INTO atlasez_member_applications
     (id,name,email,affiliation_email,family_name,given_name,middle_name,nickname,family_name_kana,given_name_kana,form_language,interests,message,status,created_at,updated_at,project_slug,project_answers,affiliation_type,institution,grade,country,timezone,desired_subjects,article_ideas,discord_user_id,availability_note,birth_date,residence_city,current_organizations,referral_source,motivation_reasons,desired_roles,interview_availability,applicant_questions)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?,'',?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      applicationId,
      name,
      email,
      affiliationEmail,
      familyName,
      givenName,
      middleName,
      nickname,
      familyNameKana,
      givenNameKana,
      formLanguage,
      interests,
      message,
      now,
      now,
      projectSlug,
      projectAnswers,
      affiliationType,
      institution,
      grade,
      country,
      timezone,
      desiredSubjectSlugs.join(","),
      articleIdeas,
      availabilityNote,
      birthDate,
      residenceCity,
      currentOrganizations,
      referralSource,
      motivationReasons,
      desiredRoles,
      interviewAvailability,
      applicantQuestions,
    )
    .run();
  const followup = {
    id: applicationId,
    name,
    email,
    projectLabel: APPLICATION_FORM_LABELS[projectSlug] ?? projectSlug,
    projectSlug,
    createdAt: now,
  };
  try {
    await createApplicationResponseTask(env, followup);
    await queueApplicationEmails(env, followup);
  } catch (error) {
    // 応募本文の保存を巻き戻さず、運営側の自動処理だけを再試行対象にする。
    console.error("application follow-up setup failed", {
      applicationId,
      error,
    });
  }
  if (ctx) ctx.waitUntil(dispatchApplicationEmails(env));
  // 応募は個人情報を含むため、Discordへは一切転送しない。運営内運営が管理画面でのみ閲覧する。
  return json(
    {
      ok: true,
      turnstileRequired: Boolean(env.TURNSTILE_SECRET_KEY),
      emailQueued: Boolean(
        env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim(),
      ),
    },
    201,
  );
}

async function purgeExpiredPersonalData(env: Env) {
  const now = new Date();
  const expiredSessions = new Date(
    now.getTime() - 24 * 60 * 60 * 1_000,
  ).toISOString();
  const expiredApplications = new Date(
    now.getTime() - 180 * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const expiredRateLimits = Math.floor(
    (now.getTime() - 24 * 60 * 60 * 1_000) / 600_000,
  );
  await Promise.all([
    env.REPORTS.prepare("DELETE FROM admin_auth_sessions WHERE expires_at < ?")
      .bind(expiredSessions)
      .run(),
    env.REPORTS.prepare(
      "DELETE FROM atlasez_application_rate_limits WHERE bucket < ?",
    )
      .bind(expiredRateLimits)
      .run(),
    env.REPORTS.prepare(
      "DELETE FROM atlasez_member_applications WHERE status IN ('rejected','accepted') AND updated_at < ?",
    )
      .bind(expiredApplications)
      .run(),
  ]);
}

const publicApplicationConfig = (env: Env): Response =>
  json({ turnstileSiteKey: env.PUBLIC_TURNSTILE_SITE_KEY ?? "" });

async function userStatus(request: Request, env: Env): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  return json({
    email: current.email,
    stage: current.stage,
    applicationStatus: current.applicationStatus,
    tutorialStep: current.tutorialStep,
    access: {
      application: canAccess(current.stage, "application"),
      applicant: canAccess(current.stage, "applicant"),
      onboarding: canAccess(current.stage, "onboarding"),
      admin: canAccess(current.stage, "admin"),
    },
  });
}

async function applicantSummary(request: Request, env: Env): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (!canAccess(current.stage, "applicant"))
    return json({ error: "応募状況を閲覧できる段階ではありません。" }, 403);
  const profile = await getApplicantProfile(env, current.email);
  const basicProfileComplete = Boolean(applicantBasicProfileComplete(profile));
  const applicationRows = await env.REPORTS.prepare(
    `SELECT a.project_slug, a.created_at, a.status, a.provisioning_status,
            a.provisioning_error, a.provisioned_at,
            COALESCE(d.discord_user_id, '') AS discord_user_id,
            COALESCE(d.oauth_connected_at, '') AS oauth_connected_at
     FROM atlasez_member_applications a
     LEFT JOIN atlasez_member_discord_accounts d ON lower(d.email)=lower(a.email)
     WHERE lower(a.email) = lower(?) ORDER BY a.created_at DESC LIMIT 20`,
  )
    .bind(current.email)
    .all<{
      project_slug: string;
      created_at: string;
      status: string;
      provisioning_status: string;
      provisioning_error: string;
      provisioned_at: string | null;
      discord_user_id: string;
      oauth_connected_at: string;
    }>();
  const applications = (applicationRows.results ?? []).map((application) => ({
    project:
      APPLICATION_FORM_LABELS[application.project_slug] ??
      application.project_slug,
    submittedAt: application.created_at,
    status: application.status,
    provisioningStatus: application.provisioning_status ?? "not_started",
    provisioningError: application.provisioning_error ?? "",
    provisionedAt: application.provisioned_at,
    discordConnected: Boolean(application.oauth_connected_at || application.discord_user_id),
  }));
  const discord = await env.REPORTS.prepare(
    `SELECT discord_user_id,oauth_connected_at FROM atlasez_member_discord_accounts
     WHERE lower(email)=lower(?)`,
  )
    .bind(current.email)
    .first<{ discord_user_id: string; oauth_connected_at: string | null }>();
  return json({
    email: current.email,
    stage: current.stage,
    basicProfileComplete,
    applications,
    discord: {
      connected: Boolean(discord),
      oauthConnected: Boolean(discord?.oauth_connected_at),
      discordUserId: discord?.discord_user_id ?? "",
    },
    // 旧クライアントとの互換性を保つため、最新応募も残す。
    application: applications[0] ?? null,
  });
}

const onboardingProjectId = (projectSlug: string) =>
  projectSlug === "seminar-platform" ? "semi-platform" : projectSlug;

const ONBOARDING_TUTORIAL_STEPS = 4;

async function getOnboarding(request: Request, env: Env): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (!canAccess(current.stage, "onboarding"))
    return json(
      { error: "オンボーディングを開始できる段階ではありません。" },
      403,
    );
  const [profile, internalProfile] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT display_name,bio FROM editorial_member_profiles WHERE lower(email)=lower(?)",
    )
      .bind(current.email)
      .first<{ display_name: string; bio: string }>(),
    current.projectSlug
      ? env.REPORTS.prepare(
          "SELECT internal_bio FROM editorial_project_member_profiles WHERE project_id=? AND lower(email)=lower(?)",
        )
          .bind(onboardingProjectId(current.projectSlug), current.email)
          .first<{ internal_bio: string }>()
      : Promise.resolve(null),
  ]);
  return json({
    email: current.email,
    project:
      APPLICATION_FORM_LABELS[current.projectSlug ?? ""] ??
      current.projectSlug ??
      "Atlasez",
    profile: {
      displayName: profile?.display_name ?? "",
      bio: profile?.bio ?? "",
      internalBio: internalProfile?.internal_bio ?? "",
    },
  });
}

async function completeOnboarding(
  request: Request,
  env: Env,
): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (!canAccess(current.stage, "onboarding"))
    return json(
      { error: "オンボーディングを完了できる段階ではありません。" },
      403,
    );
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    displayName?: unknown;
    bio?: unknown;
    internalBio?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const displayName = normalizedText(payload.displayName, 120);
  const bio = text(payload.bio, 4_000);
  const internalBio = text(payload.internalBio, 4_000).trim();
  if (!displayName || !bio)
    return json({ error: "表示名と運営外自己紹介を入力してください。" }, 400);
  if (!current.projectSlug || !APPLICATION_FORM_SLUGS.has(current.projectSlug))
    return json({ error: "応募先プロジェクトを確認できません。" }, 409);
  const now = new Date().toISOString();
  const projectId = onboardingProjectId(current.projectSlug);
  const statements = [
    env.REPORTS.prepare(
      `INSERT INTO editorial_member_profiles (email,display_name,bio,updated_at)
       VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET
       display_name=excluded.display_name,bio=excluded.bio,updated_at=excluded.updated_at`,
    ).bind(current.email, displayName, bio, now),
  ];
  // 旧クライアントからの一括送信も壊さない。新しい画面はこの分岐を使わず、
  // プロジェクト入力ページへ進む。
  if (internalBio) {
    statements.push(
      env.REPORTS.prepare(
        `INSERT INTO editorial_project_member_profiles (project_id,email,internal_bio,updated_at)
         VALUES (?,?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET
         internal_bio=excluded.internal_bio,updated_at=excluded.updated_at`,
      ).bind(projectId, current.email, internalBio, now),
      env.REPORTS.prepare(
        `INSERT INTO atlasez_member_onboarding_progress
         (project_id,email,profile_completed_at,tutorial_step,tutorial_completed_at,updated_at)
         VALUES (?,?,?,0,NULL,?)
         ON CONFLICT(project_id,email) DO UPDATE SET
         profile_completed_at=excluded.profile_completed_at,
         tutorial_step=CASE WHEN atlasez_member_onboarding_progress.tutorial_completed_at IS NULL THEN 0 ELSE atlasez_member_onboarding_progress.tutorial_step END,
         updated_at=excluded.updated_at`,
      ).bind(projectId, current.email, now, now),
    );
  }
  await env.REPORTS.batch(statements);
  return json({
    ok: true,
    stage: internalBio ? "TUTORIAL" : "ONBOARDING",
    next: internalBio ? "/onboarding/tutorial/" : "/onboarding/project/",
  });
}

async function getOnboardingProject(
  request: Request,
  env: Env,
): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (!canAccess(current.stage, "onboarding"))
    return json(
      { error: "プロジェクト情報を入力できる段階ではありません。" },
      403,
    );
  const internalProfile = current.projectSlug
    ? await env.REPORTS.prepare(
        "SELECT internal_bio FROM editorial_project_member_profiles WHERE project_id=? AND lower(email)=lower(?)",
      )
        .bind(onboardingProjectId(current.projectSlug), current.email)
        .first<{ internal_bio: string }>()
    : null;
  return json({
    email: current.email,
    project:
      APPLICATION_FORM_LABELS[current.projectSlug ?? ""] ??
      current.projectSlug ??
      "Atlasez",
    projectSlug: current.projectSlug,
    internalBio: internalProfile?.internal_bio ?? "",
  });
}

async function completeOnboardingProject(
  request: Request,
  env: Env,
): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (!canAccess(current.stage, "onboarding"))
    return json(
      { error: "プロジェクト情報を入力できる段階ではありません。" },
      403,
    );
  if (!current.baseProfileComplete)
    return json({ error: "先に基本情報を入力してください。" }, 409);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { internalBio?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const internalBio = text(payload.internalBio, 4_000).trim();
  if (!internalBio)
    return json({ error: "プロジェクト内自己紹介を入力してください。" }, 400);
  if (!current.projectSlug || !APPLICATION_FORM_SLUGS.has(current.projectSlug))
    return json({ error: "応募先プロジェクトを確認できません。" }, 409);
  const now = new Date().toISOString();
  const projectId = onboardingProjectId(current.projectSlug);
  await env.REPORTS.batch([
    env.REPORTS.prepare(
      `INSERT INTO editorial_project_member_profiles (project_id,email,internal_bio,updated_at)
       VALUES (?,?,?,?) ON CONFLICT(project_id,email) DO UPDATE SET
       internal_bio=excluded.internal_bio,updated_at=excluded.updated_at`,
    ).bind(projectId, current.email, internalBio, now),
    env.REPORTS.prepare(
      `INSERT INTO atlasez_member_onboarding_progress
       (project_id,email,profile_completed_at,tutorial_step,tutorial_completed_at,updated_at)
       VALUES (?,?,?,0,NULL,?)
       ON CONFLICT(project_id,email) DO UPDATE SET
       profile_completed_at=excluded.profile_completed_at,
       tutorial_step=CASE WHEN atlasez_member_onboarding_progress.tutorial_completed_at IS NULL THEN 0 ELSE atlasez_member_onboarding_progress.tutorial_step END,
       updated_at=excluded.updated_at`,
    ).bind(projectId, current.email, now, now),
  ]);
  return json({ ok: true, stage: "TUTORIAL", next: "/onboarding/tutorial/" });
}

async function getOnboardingTutorial(
  request: Request,
  env: Env,
): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (current.stage !== "TUTORIAL")
    return json(
      { error: "チュートリアルを開始できる段階ではありません。" },
      403,
    );
  return json({
    email: current.email,
    project:
      APPLICATION_FORM_LABELS[current.projectSlug ?? ""] ??
      current.projectSlug ??
      "Atlasez",
    projectSlug: current.projectSlug,
    atlasWritingPracticeStep: current.atlasWritingPracticeStep,
    atlasWritingPracticeComplete: current.atlasWritingPracticeComplete,
    step: Math.min(current.tutorialStep, ONBOARDING_TUTORIAL_STEPS),
    totalSteps: ONBOARDING_TUTORIAL_STEPS,
  });
}

async function advanceOnboardingTutorial(
  request: Request,
  env: Env,
): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (current.stage !== "TUTORIAL")
    return json(
      { error: "チュートリアルを進められる段階ではありません。" },
      403,
    );
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { step?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const step = Number(payload.step);
  if (!Number.isInteger(step) || step !== current.tutorialStep)
    return json(
      { error: "画面を再読み込みして、現在の手順から続けてください。" },
      409,
    );
  if (!current.projectSlug)
    return json({ error: "応募先プロジェクトを確認できません。" }, 409);
  const nextStep = Math.min(step + 1, ONBOARDING_TUTORIAL_STEPS);
  if (
    current.projectSlug === "atlas" &&
    nextStep === ONBOARDING_TUTORIAL_STEPS &&
    !current.atlasWritingPracticeComplete
  )
    return json(
      {
        error:
          "アトラスの記事編集練習を完了してから、チュートリアルを完了してください。",
      },
      409,
    );
  const completed = nextStep === ONBOARDING_TUTORIAL_STEPS;
  const now = new Date().toISOString();
  const advanced = (await env.REPORTS.prepare(
    `INSERT INTO atlasez_member_onboarding_progress
     (project_id,email,profile_completed_at,tutorial_step,tutorial_completed_at,updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(project_id,email) DO UPDATE SET
     tutorial_step=excluded.tutorial_step,
     tutorial_completed_at=excluded.tutorial_completed_at,
     updated_at=excluded.updated_at
     WHERE atlasez_member_onboarding_progress.tutorial_step=?
       AND atlasez_member_onboarding_progress.tutorial_completed_at IS NULL`,
  )
    .bind(
      onboardingProjectId(current.projectSlug),
      current.email,
      now,
      nextStep,
      completed ? now : null,
      now,
      step,
    )
    .run()) as { meta: { changes?: number } };
  if ((advanced.meta.changes ?? 0) !== 1)
    return json(
      { error: "画面を再読み込みして、現在の手順から続けてください。" },
      409,
    );
  return json({
    ok: true,
    step: nextStep,
    totalSteps: ONBOARDING_TUTORIAL_STEPS,
    complete: completed,
    stage: completed ? "MEMBER" : "TUTORIAL",
    next: completed ? "/applicant/" : "/onboarding/tutorial/",
  });
}

async function completeAtlasWritingPractice(
  request: Request,
  env: Env,
): Promise<Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) return current;
  if (current.stage !== "TUTORIAL" || current.projectSlug !== "atlas")
    return json(
      { error: "アトラスの記事編集練習を開始できる段階ではありません。" },
      403,
    );
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { action?: unknown; title?: unknown; body?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const action = text(payload.action, 48).trim();
  const steps = [
    "save-draft",
    "request-feedback",
    "resolve-feedback",
    "check-schedule",
  ] as const;
  const currentStep = current.atlasWritingPracticeComplete
    ? 4
    : current.atlasWritingPracticeStep;
  if (currentStep >= 4)
    return json({
      ok: true,
      step: 4,
      complete: true,
      next: "/onboarding/tutorial/",
    });
  if (action !== steps[currentStep])
    return json(
      { error: "画面を再読み込みして、現在の手順から続けてください。" },
      409,
    );
  if (action === "save-draft") {
    const title = text(payload.title, 160).trim();
    const body = text(payload.body, 8_000).trim();
    const hasMath = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/.test(body);
    if (
      title.length < 4 ||
      body.length < 20 ||
      !/\*\*[^*\n]+\*\*/.test(body) ||
      !hasMath
    )
      return json(
        {
          error:
            "タイトル、本文、太字（**太字**）と数式（$x^2$ など）を入力してから保存してください。",
        },
        400,
      );
  }
  const now = new Date().toISOString();
  const nextStep = currentStep + 1;
  const updated = (await env.REPORTS.prepare(
    `UPDATE atlasez_member_onboarding_progress
     SET atlas_writing_practice_step=?,
         atlas_writing_practice_completed_at=CASE WHEN ?=4 THEN COALESCE(atlas_writing_practice_completed_at, ?) ELSE atlas_writing_practice_completed_at END,
         updated_at=?
     WHERE project_id=? AND lower(email)=lower(?) AND tutorial_completed_at IS NULL
       AND atlas_writing_practice_step=?`,
  )
    .bind(
      nextStep,
      nextStep,
      now,
      now,
      onboardingProjectId("atlas"),
      current.email,
      currentStep,
    )
    .run()) as { meta: { changes?: number } };
  if ((updated.meta.changes ?? 0) !== 1)
    return json(
      {
        error:
          "練習の状態を保存できませんでした。ページを読み込み直してから試してください。",
      },
      409,
    );
  return json({
    ok: true,
    step: nextStep,
    complete: nextStep === 4,
    next: nextStep === 4 ? "/onboarding/tutorial/" : null,
  });
}

async function fetchAdminAsset(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // Astroはプロジェクト別応募画面を同じ静的フォームとして配信する。
  // ブラウザ上のURLはプロジェクト別のまま保ち、本文側でslugを判定する。
  const assetRequest = isProjectApplicationPath(url.pathname)
    ? new Request(new URL("/apply/", request.url), request)
    : request;
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function getEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この分野の原稿を閲覧する権限がありません。" }, 403);
  const comments = await env.REPORTS.prepare(
    `SELECT id, document_id, parent_comment_id, body, created_by, created_at, selection_start, selection_end, selection_text,
      acknowledged_at, acknowledged_by, resolved_at, resolved_by
     FROM editorial_comments WHERE document_id = ? ORDER BY resolved_at IS NOT NULL, created_at ASC`,
  )
    .bind(documentId)
    .all<EditorialComment>();
  const commentRows = comments.results ?? [];
  const commentIds = commentRows.map((comment) => comment.id);
  const actionRows = commentIds.length
    ? await env.REPORTS.prepare(
        `SELECT comment_id, actor_email, action, created_at FROM editorial_comment_actions WHERE comment_id IN (${commentIds.map(() => "?").join(",")}) ORDER BY created_at ASC`,
      )
        .bind(...commentIds)
        .all<{
          comment_id: string;
          actor_email: string;
          action: string;
          created_at: string;
        }>()
    : {
        results: [] as {
          comment_id: string;
          actor_email: string;
          action: string;
          created_at: string;
        }[],
      };
  const reactionRows = commentIds.length
    ? await env.REPORTS.prepare(
        `SELECT comment_id, actor_email, reaction, created_at
         FROM editorial_comment_reactions
         WHERE comment_id IN (${commentIds.map(() => "?").join(",")})
         ORDER BY created_at ASC`,
      )
        .bind(...commentIds)
        .all<{
          comment_id: string;
          actor_email: string;
          reaction: string;
          created_at: string;
        }>()
    : {
        results: [] as {
          comment_id: string;
          actor_email: string;
          reaction: string;
          created_at: string;
        }[],
      };
  const reactionsByComment = new Map<string, Map<string, number>>();
  for (const reaction of reactionRows.results ?? []) {
    if (reaction.reaction !== "smile") continue;
    const actors = reactionsByComment.get(reaction.comment_id) ?? new Map();
    const actor = reaction.actor_email.trim().toLowerCase();
    if (actor) actors.set(actor, (actors.get(actor) ?? 0) + 1);
    reactionsByComment.set(reaction.comment_id, actors);
  }
  type CommentAction = "acknowledge" | "unacknowledge" | "resolve" | "reopen";
  type CommentActionCounts = Record<CommentAction, number>;
  type CommentActionActors = Record<CommentAction, Map<string, number>>;
  const emptyActionCounts = (): CommentActionCounts => ({
    acknowledge: 0,
    unacknowledge: 0,
    resolve: 0,
    reopen: 0,
  });
  const emptyActionActors = (): CommentActionActors => ({
    acknowledge: new Map(),
    unacknowledge: new Map(),
    resolve: new Map(),
    reopen: new Map(),
  });
  const actionsByComment = new Map<
    string,
    {
      actors: Record<
        "acknowledged" | "unacknowledged" | "resolved" | "reopened",
        Set<string>
      >;
      counts: CommentActionCounts;
      actorCounts: CommentActionActors;
    }
  >();
  const documentActionCounts = emptyActionCounts();
  const documentActionActors = emptyActionActors();
  const addAction = (
    commentId: string,
    action: CommentAction,
    actorEmail: string,
    count = 1,
  ) => {
    const entry = actionsByComment.get(commentId) ?? {
      actors: {
        acknowledged: new Set<string>(),
        unacknowledged: new Set<string>(),
        resolved: new Set<string>(),
        reopened: new Set<string>(),
      },
      counts: emptyActionCounts(),
      actorCounts: emptyActionActors(),
    };
    const actorSet =
      action === "acknowledge"
        ? entry.actors.acknowledged
        : action === "unacknowledge"
          ? entry.actors.unacknowledged
          : action === "resolve"
            ? entry.actors.resolved
            : entry.actors.reopened;
    actorSet.add(actorEmail);
    entry.counts[action] += count;
    entry.actorCounts[action].set(
      actorEmail,
      (entry.actorCounts[action].get(actorEmail) ?? 0) + count,
    );
    documentActionCounts[action] += count;
    documentActionActors[action].set(
      actorEmail,
      (documentActionActors[action].get(actorEmail) ?? 0) + count,
    );
    actionsByComment.set(commentId, entry);
  };
  const latestFeedback = new Map<
    string,
    Map<string, "acknowledge" | "unacknowledge">
  >();
  const latestResolution = new Map<string, Map<string, "resolve" | "reopen">>();
  for (const action of actionRows.results ?? []) {
    if (action.action === "acknowledge" || action.action === "unacknowledge") {
      const feedback = latestFeedback.get(action.comment_id) ?? new Map();
      feedback.set(action.actor_email.toLowerCase(), action.action);
      latestFeedback.set(action.comment_id, feedback);
    } else if (action.action === "resolve" || action.action === "reopen") {
      const resolution = latestResolution.get(action.comment_id) ?? new Map();
      resolution.set(action.actor_email.toLowerCase(), action.action);
      latestResolution.set(action.comment_id, resolution);
    }
  }
  for (const [commentId, feedback] of latestFeedback)
    for (const [actorEmail, action] of feedback)
      addAction(commentId, action, actorEmail);
  for (const [commentId, resolution] of latestResolution)
    for (const [actorEmail, action] of resolution)
      if (action === "resolve") addAction(commentId, action, actorEmail);
  const authorEmails = [
    ...new Set(
      [
        ...commentRows.map((comment) => comment.created_by),
        ...(actionRows.results ?? []).map((action) => action.actor_email),
        ...(reactionRows.results ?? []).map((reaction) => reaction.actor_email),
      ].filter(Boolean),
    ),
  ];
  const authorProfiles = authorEmails.length
    ? await env.REPORTS.prepare(
        `SELECT email, display_name, avatar_url FROM editorial_member_profiles WHERE email IN (${authorEmails.map(() => "?").join(",")})`,
      )
        .bind(...authorEmails)
        .all<{ email: string; display_name: string; avatar_url: string }>()
    : {
        results: [] as {
          email: string;
          display_name: string;
          avatar_url: string;
        }[],
      };
  const authorProfileByEmail = new Map(
    (authorProfiles.results ?? []).map((profile) => [
      profile.email.toLowerCase(),
      profile,
    ]),
  );
  const selectionRows = commentIds.length
    ? await env.REPORTS.prepare(
        `SELECT id, comment_id, position, selection_start, selection_end, selection_text
       FROM editorial_comment_selections WHERE comment_id IN (${commentIds.map(() => "?").join(",")})
       ORDER BY position ASC`,
      )
        .bind(...commentIds)
        .all<EditorialCommentSelection>()
    : { results: [] as EditorialCommentSelection[] };
  const selectionsByComment = new Map<string, EditorialCommentSelection[]>();
  for (const selection of selectionRows.results ?? [])
    selectionsByComment.set(selection.comment_id, [
      ...(selectionsByComment.get(selection.comment_id) ?? []),
      selection,
    ]);
  const tagRows = commentIds.length
    ? await env.REPORTS.prepare(
        `SELECT comment_id, position, tag FROM editorial_comment_tags
         WHERE comment_id IN (${commentIds.map(() => "?").join(",")})
         ORDER BY position ASC`,
      )
        .bind(...commentIds)
        .all<{ comment_id: string; position: number; tag: string }>()
    : {
        results: [] as { comment_id: string; position: number; tag: string }[],
      };
  const tagsByComment = new Map<string, string[]>();
  for (const tag of tagRows.results ?? [])
    tagsByComment.set(tag.comment_id, [
      ...(tagsByComment.get(tag.comment_id) ?? []),
      tag.tag,
    ]);
  const actorCountList = (counts: Map<string, number>) =>
    [...counts.entries()].map(([actor_email, count]) => ({
      actor_email,
      actor_display_name:
        authorProfileByEmail
          .get(actor_email.toLowerCase())
          ?.display_name?.trim() || actor_email,
      count,
    }));
  const commentsWithSelections = commentRows.map((comment) => {
    const entry = actionsByComment.get(comment.id) ?? {
      actors: {
        acknowledged: new Set<string>(),
        unacknowledged: new Set<string>(),
        resolved: new Set<string>(),
        reopened: new Set<string>(),
      },
      counts: emptyActionCounts(),
      actorCounts: emptyActionActors(),
    };
    // 0049以前のコメントには状態の最終操作者だけが残っているため、旧列を1件の履歴として補う。
    if (
      comment.acknowledged_by &&
      !entry.actorCounts.acknowledge.has(
        comment.acknowledged_by.toLowerCase(),
      ) &&
      !entry.actorCounts.unacknowledge.has(
        comment.acknowledged_by.toLowerCase(),
      )
    )
      addAction(
        comment.id,
        "acknowledge",
        comment.acknowledged_by.toLowerCase(),
      );
    if (
      comment.resolved_by &&
      !entry.actorCounts.resolve.has(comment.resolved_by.toLowerCase())
    )
      addAction(comment.id, "resolve", comment.resolved_by);
    const current = actionsByComment.get(comment.id) ?? entry;
    const resolvedActors = new Set(current.actorCounts.resolve.keys());
    // 自分が付けたコメントは、自分で反映済みにした時点で解決とする。
    // 他人のコメントは、従来どおり投稿者の反映済み操作を必須にする。
    const resolvedByAuthor = resolvedActors.has(
      comment.created_by.trim().toLowerCase(),
    );
    return {
      ...comment,
      resolved_at: resolvedByAuthor ? comment.resolved_at : null,
      resolved_by: resolvedByAuthor ? comment.resolved_by : null,
      author_display_name:
        authorProfileByEmail
          .get(comment.created_by.toLowerCase())
          ?.display_name?.trim() || "運営メンバー",
      author_avatar_url:
        authorProfileByEmail.get(comment.created_by.toLowerCase())
          ?.avatar_url ?? "",
      acknowledged_by_emails: [...current.actors.acknowledged],
      unacknowledged_by_emails: [...current.actors.unacknowledged],
      resolved_by_emails: [...current.actors.resolved],
      reopened_by_emails: [...current.actors.reopened],
      action_counts: current.counts,
      action_actor_counts: {
        acknowledge: actorCountList(current.actorCounts.acknowledge),
        unacknowledge: actorCountList(current.actorCounts.unacknowledge),
        resolve: actorCountList(current.actorCounts.resolve),
        reopen: actorCountList(current.actorCounts.reopen),
      },
      tags: tagsByComment.get(comment.id) ?? [],
      like_actor_counts: [
        ...(reactionsByComment.get(comment.id) ?? new Map()),
      ].map(([actor_email, count]) => ({
        actor_email,
        actor_display_name:
          authorProfileByEmail.get(actor_email)?.display_name?.trim() ||
          actor_email,
        count,
      })),
      selections:
        selectionsByComment.get(comment.id) ??
        (comment.selection_text
          ? [
              {
                id: `legacy-${comment.id}`,
                comment_id: comment.id,
                position: 0,
                selection_start: comment.selection_start,
                selection_end: comment.selection_end,
                selection_text: comment.selection_text,
              },
            ]
          : []),
    };
  });
  const summaryActorList = (counts: Map<string, number>) =>
    actorCountList(counts).sort(
      (a, b) => b.count - a.count || a.actor_email.localeCompare(b.actor_email),
    );
  return json({
    document,
    comments: commentsWithSelections,
    comment_action_summary: {
      counts: documentActionCounts,
      actors: {
        acknowledge: summaryActorList(documentActionActors.acknowledge),
        unacknowledge: summaryActorList(documentActionActors.unacknowledge),
        resolve: summaryActorList(documentActionActors.resolve),
        reopen: summaryActorList(documentActionActors.reopen),
      },
    },
  });
}

type CommentSelectionInput = {
  start: number | null;
  end: number | null;
  text: string;
};

function editorialCommentSelections(
  payload: EditorialCommentPayload,
): CommentSelectionInput[] | Response {
  const raw = Array.isArray(payload.selections) ? payload.selections : [];
  const legacy = raw.length
    ? []
    : [
        {
          start: payload.selectionStart,
          end: payload.selectionEnd,
          text: payload.selectionText,
        },
      ];
  const candidates = raw.length ? raw : legacy;
  const selections: CommentSelectionInput[] = [];
  for (const candidate of candidates.slice(0, 8)) {
    if (!candidate || typeof candidate !== "object")
      return json({ error: "選択範囲を確認してください。" }, 400);
    const value = candidate as {
      start?: unknown;
      end?: unknown;
      text?: unknown;
    };
    const start =
      typeof value.start === "number" &&
      Number.isInteger(value.start) &&
      value.start >= 0
        ? value.start
        : null;
    const end =
      typeof value.end === "number" &&
      Number.isInteger(value.end) &&
      value.end >= (start ?? 0)
        ? value.end
        : null;
    const selectedText = text(value.text, 2_000);
    if ((start === null) !== (end === null))
      return json({ error: "選択範囲を正しく取得できませんでした。" }, 400);
    if (selectedText) selections.push({ start, end, text: selectedText });
  }
  return selections;
}

function editorialCommentTags(
  payload: EditorialCommentPayload,
): string[] | null | Response {
  if (payload.tags === undefined) return null;
  if (!Array.isArray(payload.tags))
    return json({ error: "コメントタグを確認してください。" }, 400);
  const tags = [
    ...new Set(
      payload.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 6 || tags.some((tag) => !EDITORIAL_COMMENT_TAGS.has(tag)))
    return json({ error: "選択できないコメントタグが含まれています。" }, 400);
  return tags;
}

async function replaceEditorialCommentSelections(
  env: Env,
  commentId: string,
  selections: CommentSelectionInput[],
) {
  await env.REPORTS.prepare(
    "DELETE FROM editorial_comment_selections WHERE comment_id = ?",
  )
    .bind(commentId)
    .run();
  for (const [position, selection] of selections.entries())
    await env.REPORTS.prepare(
      `INSERT INTO editorial_comment_selections
        (id, comment_id, position, selection_start, selection_end, selection_text)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        commentId,
        position,
        selection.start,
        selection.end,
        selection.text,
      )
      .run();
}

async function replaceEditorialCommentTags(
  env: Env,
  commentId: string,
  tags: string[],
) {
  await env.REPORTS.prepare(
    "DELETE FROM editorial_comment_tags WHERE comment_id = ?",
  )
    .bind(commentId)
    .run();
  for (const [position, tag] of tags.entries())
    await env.REPORTS.prepare(
      `INSERT INTO editorial_comment_tags (id, comment_id, position, tag)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), commentId, position, tag)
      .run();
}

async function createEditorialDocument(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const payload = await readEditorialPayload(request);
  if (payload instanceof Response) return payload;
  const values = editorialValues(payload);
  if (!values)
    return json(
      {
        error: "記事設定を確認してください。タイトル・要約・概念IDは必須です。",
      },
      400,
    );
  if (!canEditSubject(scope, values.subject))
    return json({ error: "この分野の原稿を作成する権限がありません。" }, 403);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `INSERT INTO editorial_documents
      (id, source_article_id, subject, category, locale, slug, title, summary, concept_id, body, writing_memo, latex_engine,
       status, created_by, updated_by, created_at, updated_at, reviewed_at, scheduled_publish_at, scheduled_publish_claimed_at, publication_review_stage, publication_review_round, locked_ranges, article_references)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      values.sourceArticleId,
      values.subject,
      values.category,
      values.locale,
      values.slug,
      values.title,
      values.summary,
      values.conceptId,
      values.body,
      values.writingMemo,
      values.latexEngine,
      values.status,
      scope.email,
      scope.email,
      now,
      now,
      values.status === "approved" ? now : null,
      null,
      null,
      null,
      0,
      JSON.stringify(values.lockedRanges ?? []),
      JSON.stringify(values.references ?? []),
    )
    .run();
  return json({ ok: true, id }, 201);
}

async function updateEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const payload = await readEditorialPayload(request);
  if (payload instanceof Response) return payload;
  const values = editorialValues(payload);
  if (!values)
    return json(
      {
        error: "記事設定を確認してください。タイトル・要約・概念IDは必須です。",
      },
      400,
    );
  const existing = await env.REPORTS.prepare(
    "SELECT subject, status, title, summary, concept_id, body, writing_memo, category, locale, slug, latex_engine, published_at, scheduled_publish_at, scheduled_publish_claimed_at, publication_review_stage, publication_review_round, locked_ranges, article_references FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<
      Pick<
        EditorialDocument,
        | "subject"
        | "status"
        | "title"
        | "summary"
        | "concept_id"
        | "body"
        | "writing_memo"
        | "category"
        | "locale"
        | "slug"
        | "latex_engine"
        | "published_at"
        | "scheduled_publish_at"
        | "scheduled_publish_claimed_at"
        | "publication_review_stage"
        | "publication_review_round"
        | "locked_ranges"
        | "article_references"
      >
    >();
  if (!existing) return json({ error: "原稿が見つかりません。" }, 404);
  if (existing.publication_review_stage)
    return json({ error: "公開審査中は原稿を編集できません。審査担当の判断を待つか、差し戻してください。" }, 409);
  const isReviewOnly =
    scope.isManager && !canEditSubject(scope, existing.subject);
  if (
    (!canEditSubject(scope, existing.subject) && !isReviewOnly) ||
    (!canEditSubject(scope, values.subject) &&
      values.subject !== existing.subject)
  )
    return json({ error: "この分野の原稿を更新する権限がありません。" }, 403);
  // 同じ分野の担当者は共同執筆者として保存できる。担当外の管理者は
  // 従来どおり本文を変更できず、フィードバック状態とコメントだけを扱う。
  if (
    isReviewOnly &&
    (values.subject !== existing.subject ||
      values.category !== existing.category ||
      values.locale !== existing.locale ||
      values.slug !== existing.slug ||
      values.title !== existing.title ||
      values.summary !== existing.summary ||
      values.conceptId !== existing.concept_id ||
      values.body !== existing.body ||
      (values.references !== undefined &&
        JSON.stringify(values.references) !==
          (existing.article_references ?? "[]")) ||
      values.writingMemo !== existing.writing_memo ||
      values.latexEngine !== existing.latex_engine ||
      (values.status !== "approved" && existing.scheduled_publish_at !== null) ||
      (values.lockedRanges !== undefined &&
        JSON.stringify(values.lockedRanges) !==
          JSON.stringify(
            storedEditorialLockedRanges(existing.locked_ranges, existing.body),
          )))
  )
    return json(
      {
        error:
          "担当外の原稿は本文を編集できません。査読結果（状態）とコメントのみ更新できます。",
      },
      403,
    );
  if (values.status === "approved" && !scope.isManager)
    return json({ error: "承認済みに変更できるのは運営管理者だけです。" }, 403);
  if (existing.published_at && values.status !== "approved")
    return json(
      {
        error:
          "公開済み原稿を下書きへ戻すには「公開を取り消して下書きへ戻す」を使ってください。",
      },
      400,
    );
  const now = new Date().toISOString();
  const previous = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (previous)
    await env.REPORTS.prepare(
      "INSERT INTO editorial_document_revisions (id, document_id, title, summary, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        crypto.randomUUID(),
        documentId,
        previous.title,
        previous.summary,
        previous.body,
        previous.status,
        scope.email,
        now,
      )
      .run();
  await env.REPORTS.prepare(
    `UPDATE editorial_documents SET source_article_id = ?, subject = ?, category = ?, locale = ?,
      slug = ?, title = ?, summary = ?, concept_id = ?, body = ?, writing_memo = ?, latex_engine = ?, status = ?, updated_by = ?, locked_ranges = ?, article_references = ?,
      updated_at = ?, reviewed_at = CASE WHEN ? = 'approved' THEN COALESCE(reviewed_at, ?) ELSE NULL END,
      scheduled_publish_at = CASE WHEN ? = 'approved' THEN scheduled_publish_at ELSE NULL END,
      scheduled_publish_claimed_at = CASE WHEN ? = 'approved' THEN scheduled_publish_claimed_at ELSE NULL END,
      publication_review_stage = CASE WHEN ? = 'approved' THEN publication_review_stage ELSE NULL END
     WHERE id = ?`,
  )
    .bind(
      values.sourceArticleId,
      values.subject,
      values.category,
      values.locale,
      values.slug,
      values.title,
      values.summary,
      values.conceptId,
      values.body,
      values.writingMemo,
      values.latexEngine,
      values.status,
      scope.email,
      JSON.stringify(
        values.lockedRanges ??
          storedEditorialLockedRanges(existing.locked_ranges, existing.body),
      ),
      JSON.stringify(
        values.references ??
          storedArticleReferences(existing.article_references),
      ),
      now,
      values.status,
      now,
      values.status,
      values.status,
      values.status,
      documentId,
    )
    .run();
  return json({ ok: true });
}

async function listEditorialRevisions(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    "SELECT subject, status FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string; status: EditorialDocumentStatus }>();
  if (!document || !canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この原稿を閲覧する権限がありません。" }, 403);
  const result = await env.REPORTS.prepare(
    "SELECT id, title, summary, body, status, saved_by, saved_at FROM editorial_document_revisions WHERE document_id = ? ORDER BY saved_at DESC LIMIT 50",
  )
    .bind(documentId)
    .all();
  const feedbackRequests = await env.REPORTS.prepare(
    `SELECT t.id AS task_id, t.title, t.details, t.status, t.assignee_email,
            t.created_by, t.created_at, t.updated_at,
            COALESCE(NULLIF(TRIM(profile.display_name), ''), t.created_by) AS requester_display_name
       FROM editorial_feedback_task_links link
       JOIN editorial_tasks t ON t.id = link.task_id AND t.task_kind = 'feedback'
       LEFT JOIN editorial_member_profiles profile ON lower(profile.email) = lower(t.created_by)
      WHERE link.document_id = ?
      ORDER BY link.created_at DESC, t.created_at DESC
      LIMIT 100`,
  )
    .bind(documentId)
    .all<{
      task_id: string;
      title: string;
      details: string;
      status: string;
      assignee_email: string | null;
      created_by: string;
      created_at: string;
      updated_at: string;
      requester_display_name: string;
    }>();
  return json({
    revisions: result.results,
    feedbackRequests: feedbackRequests.results ?? [],
  });
}

async function editorialBoard(request: Request, env: Env): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.allSubjects && !scope.subjects.length) return json({ board: [] });
  const values: unknown[] = scope.allSubjects ? [] : [...scope.subjects];
  const where = scope.allSubjects
    ? ""
    : ` WHERE subject IN (${scope.subjects.map(() => "?").join(",")})`;
  const result = await env.REPORTS.prepare(
    `SELECT subject, status, COUNT(*) AS count FROM editorial_documents${where} GROUP BY subject,status ORDER BY subject,status`,
  )
    .bind(...values)
    .all();
  return json({ board: result.results });
}

async function listEditorialReviewRequests(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.allSubjects && !scope.subjects.length)
    return json({ requests: [], reviewers: [] });
  const subjectFilter = scope.allSubjects
    ? ""
    : ` AND d.subject IN (${scope.subjects.map(() => "?").join(",")})`;
  const reviewerFilter = scope.allSubjects
    ? ""
    : ` WHERE p.subject = '*' OR p.subject IN (${scope.subjects.map(() => "?").join(",")})`;
  const subjectValues = scope.allSubjects ? [] : scope.subjects;
  const [result, reviewerResult] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT d.id, d.subject, d.category, d.title, d.updated_by, d.updated_at,
         COALESCE(NULLIF((SELECT GROUP_CONCAT(rr.reviewer_email) FROM editorial_review_assignment_recipients rr WHERE rr.document_id = d.id), ''), r.reviewer_email) AS reviewer_email,
         r.request_note,
         COALESCE(NULLIF(TRIM(requester.display_name), ''), '表示名未設定') AS requester_display_name,
         COALESCE(NULLIF((SELECT GROUP_CONCAT(COALESCE(NULLIF(TRIM(rm.display_name), ''), rr.reviewer_email)) FROM editorial_review_assignment_recipients rr LEFT JOIN editorial_member_profiles rm ON lower(rm.email) = lower(rr.reviewer_email) WHERE rr.document_id = d.id), ''), COALESCE(NULLIF(TRIM(reviewer.display_name), ''), '')) AS reviewer_display_name
       FROM editorial_documents d
       LEFT JOIN editorial_review_assignments r ON r.document_id = d.id
       LEFT JOIN editorial_member_profiles requester ON requester.email = d.updated_by
       LEFT JOIN editorial_member_profiles reviewer ON reviewer.email = r.reviewer_email
       WHERE d.status = 'in-review'${subjectFilter}
       ORDER BY CASE WHEN lower(r.reviewer_email) = lower(?) THEN 0 WHEN r.reviewer_email IS NULL THEN 2 ELSE 1 END,
                d.updated_at ASC LIMIT 100`,
    )
      .bind(scope.email, ...subjectValues)
      .all<{
        id: string;
        subject: string;
        category: string;
        title: string;
        updated_by: string;
        updated_at: string;
        reviewer_email: string | null;
        requester_display_name: string;
        reviewer_display_name: string;
        request_note: string;
      }>(),
    env.REPORTS.prepare(
      `SELECT p.email,
         COALESCE(NULLIF(TRIM(m.display_name), ''), '表示名未設定') AS display_name,
         GROUP_CONCAT(DISTINCT p.subject) AS subjects
       FROM report_admin_permissions p
       LEFT JOIN editorial_member_profiles m ON m.email = p.email${reviewerFilter}
       GROUP BY p.email, m.display_name
       ORDER BY display_name, p.email`,
    )
      .bind(...subjectValues)
      .all<{ email: string; display_name: string; subjects: string | null }>(),
  ]);
  return json({
    requests: (result.results ?? []).map((item) => ({
      ...item,
      reviewerDisplayName:
        item.reviewer_email === "*"
          ? "分野担当者全員"
          : item.reviewer_display_name || "表示名未設定",
      assignedToMe:
        item.reviewer_email
          ?.split(",")
          .some(
            (email) => email.trim().toLowerCase() === scope.email.toLowerCase(),
          ) ?? false,
    })),
    reviewers: (reviewerResult.results ?? []).map((item) => ({
      email: item.email,
      displayName: item.display_name,
      subjects: item.subjects?.split(",").filter(Boolean) ?? [],
    })),
  });
}

async function updateEditorialReviewAssignment(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: {
    reviewerEmail?: unknown;
    reviewerEmails?: unknown;
    note?: unknown;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return json({ error: "入力内容を読み取れませんでした。" }, 400);
  }
  const document = await env.REPORTS.prepare(
    "SELECT subject, status, title, created_by FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{
      subject: string;
      status: EditorialDocumentStatus;
      title: string;
      created_by: string;
    }>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (document.status !== "in-review")
    return json({ error: "フィードバック中の原稿だけ担当者を設定できます。" }, 400);
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この分野のフィードバック権限がありません。" }, 403);
  const reviewerEmails = [
    ...(Array.isArray(payload.reviewerEmails)
      ? payload.reviewerEmails
      : [payload.reviewerEmail]),
  ]
    .map((value) => text(value, 320).toLowerCase())
    .filter(Boolean)
    .filter((email, index, all) => all.indexOf(email) === index);
  const requestNote = text(payload.note, 2_000);
  const existingAssignment = await env.REPORTS.prepare(
    "SELECT task_id FROM editorial_review_assignments WHERE document_id = ?",
  )
    .bind(documentId)
    .first<{ task_id: string | null }>();
  if (!reviewerEmails.length) {
    const statements = [
      ...(existingAssignment?.task_id
        ? [
            env.REPORTS.prepare(
              "UPDATE editorial_tasks SET status='done',updated_at=? WHERE id=? AND task_kind='feedback'",
            ).bind(new Date().toISOString(), existingAssignment.task_id),
          ]
        : []),
      env.REPORTS.prepare(
        "DELETE FROM editorial_review_assignment_recipients WHERE document_id = ?",
      ).bind(documentId),
      env.REPORTS.prepare(
        "DELETE FROM editorial_review_assignments WHERE document_id = ?",
      ).bind(documentId),
    ];
    await env.REPORTS.batch(statements);
    return json({ ok: true, reviewerEmail: null, reviewerEmails: [] });
  }
  if (reviewerEmails.includes("*") && reviewerEmails.length > 1)
    return json(
      { error: "担当者全員と個別担当者は同時に選択できません。" },
      400,
    );
  if (
    reviewerEmails.some((email) => email !== "*" && !EMAIL_PATTERN.test(email))
  )
    return json(
      { error: "フィードバック担当者のメールアドレスを確認してください。" },
      400,
    );
  const reviewers = reviewerEmails.includes("*")
    ? [{ found: 1 }]
    : await Promise.all(
        reviewerEmails.map((email) =>
          env.REPORTS.prepare(
            "SELECT 1 AS found FROM report_admin_permissions WHERE lower(email) = lower(?) AND (subject = '*' OR subject = ?) LIMIT 1",
          )
            .bind(email, document.subject)
            .first<{ found: number }>(),
        ),
      );
  if (reviewers.some((reviewer) => !reviewer))
    return json(
      {
        error:
          "選択した担当者の中に、この原稿の分野を担当できない運営者がいます。",
      },
      400,
    );
  const now = new Date().toISOString();
  // 各フィードバック依頼は、記事に紐づく独立した共通タスクとして残す。
  // 最新の依頼だけは既存の assignment テーブルにも保持し、旧一覧との互換を維持する。
  const taskId = crypto.randomUUID();
  const taskAssignee = reviewerEmails.includes("*")
    ? "*"
    : reviewerEmails.join(",");
  const taskDetails = requestNote
    ? `${requestNote}\n\n記事編集画面: /admin/editor/?document=${documentId}`
    : `記事のフィードバックをお願いします。\n\n記事編集画面: /admin/editor/?document=${documentId}`;
  await env.REPORTS.batch([
    env.REPORTS.prepare(
      `INSERT INTO editorial_review_assignments (document_id, reviewer_email, requested_by, requested_at, updated_at, request_note, task_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET reviewer_email = excluded.reviewer_email,
         requested_by = excluded.requested_by, updated_at = excluded.updated_at, request_note = excluded.request_note, task_id = excluded.task_id`,
    ).bind(
      documentId,
      reviewerEmails[0],
      scope.email,
      now,
      now,
      requestNote,
      taskId,
    ),
    env.REPORTS.prepare(
      `INSERT INTO editorial_tasks (id,project_id,subject,assignee_email,title,details,status,created_by,created_at,updated_at,task_kind)
       VALUES (?, 'atlas', ?, ?, ?, ?, 'open', ?, ?, ?, 'feedback')
      `,
    ).bind(
      taskId,
      document.subject,
      taskAssignee,
      `フィードバック依頼：${document.title}`,
      taskDetails,
      scope.email,
      now,
      now,
    ),
    env.REPORTS.prepare(
      "INSERT INTO editorial_feedback_task_links (task_id, document_id, created_at) VALUES (?, ?, ?)",
    ).bind(taskId, documentId, now),
    env.REPORTS.prepare(
      "DELETE FROM editorial_review_assignment_recipients WHERE document_id = ?",
    ).bind(documentId),
    ...reviewerEmails
      .filter((email) => email !== "*")
      .map((email) =>
        env.REPORTS.prepare(
          "INSERT INTO editorial_review_assignment_recipients (document_id, reviewer_email, requested_at, updated_at) VALUES (?, ?, ?, ?)",
        ).bind(documentId, email, now, now),
      ),
  ]);
  return json({
    ok: true,
    reviewerEmail: reviewerEmails[0],
    reviewerEmails,
    taskId,
    taskKind: "feedback",
  });
}

async function createEditorialComment(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  if (
    request.headers.get("content-type")?.includes("application/json") !== true
  )
    return json({ error: "JSON形式で送信してください。" }, 415);
  let payload: EditorialCommentPayload;
  try {
    payload = (await request.json()) as EditorialCommentPayload;
  } catch {
    return json({ error: "コメントを読み取れませんでした。" }, 400);
  }
  const body = text(payload.body, MAX_EDITORIAL_COMMENT_LENGTH);
  const selections = editorialCommentSelections(payload);
  if (selections instanceof Response) return selections;
  const tags = editorialCommentTags(payload);
  if (tags instanceof Response) return tags;
  // タグや本文引用だけでも、レビュー上の意味を持つコメントとして保存できる。
  // 本文・タグ・引用のいずれもない空送信だけは従来どおり拒否する。
  if (!body && !(tags ?? []).length && !selections.length)
    return json({ error: "コメント本文またはタグを入力してください。" }, 400);
  const document = await env.REPORTS.prepare(
    "SELECT subject, status FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string; status: EditorialDocumentStatus }>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この分野にコメントする権限がありません。" }, 403);
  const parentCommentId =
    typeof payload.parentCommentId === "string" &&
    /^[0-9a-f-]{36}$/i.test(payload.parentCommentId)
      ? payload.parentCommentId
      : null;
  if (parentCommentId) {
    const parent = await env.REPORTS.prepare(
      "SELECT id FROM editorial_comments WHERE id = ? AND document_id = ?",
    )
      .bind(parentCommentId, documentId)
      .first<{ id: string }>();
    if (!parent)
      return json({ error: "返信先のコメントが見つかりません。" }, 404);
  }
  const commentId = crypto.randomUUID();
  const firstSelection = selections[0] ?? null;
  await env.REPORTS.prepare(
    `INSERT INTO editorial_comments
      (id, document_id, parent_comment_id, body, created_by, created_at, selection_start, selection_end, selection_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      commentId,
      documentId,
      parentCommentId,
      body,
      scope.email,
      new Date().toISOString(),
      firstSelection?.start ?? null,
      firstSelection?.end ?? null,
      firstSelection?.text ?? null,
    )
    .run();
  await replaceEditorialCommentSelections(env, commentId, selections);
  await replaceEditorialCommentTags(env, commentId, tags ?? []);
  await notifyEditorialCommentChange(env, documentId);
  return json({ ok: true }, 201);
}

async function updateEditorialCommentStatus(
  request: Request,
  env: Env,
  documentId: string,
  commentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: { action?: unknown };
  try {
    payload = (await request.json()) as { action?: unknown };
  } catch {
    return json({ error: "操作を読み取れませんでした。" }, 400);
  }
  const action = payload.action;
  if (
    action !== "acknowledge" &&
    action !== "unacknowledge" &&
    action !== "resolve" &&
    action !== "reopen" &&
    action !== "like"
  )
    return json({ error: "操作を確認してください。" }, 400);
  const comment = await env.REPORTS.prepare(
    `SELECT c.id, c.created_by, d.subject, d.status FROM editorial_comments c
     JOIN editorial_documents d ON d.id = c.document_id WHERE c.id = ? AND c.document_id = ?`,
  )
    .bind(commentId, documentId)
    .first<{
      id: string;
      created_by: string;
      subject: string;
      status: EditorialDocumentStatus;
    }>();
  if (!comment) return json({ error: "コメントが見つかりません。" }, 404);
  if (!canReviewDocument(scope, comment.subject, comment.status))
    return json({ error: "このコメントを操作する権限がありません。" }, 403);
  if (action === "like") {
    const existing = await env.REPORTS.prepare(
      `SELECT id FROM editorial_comment_reactions
       WHERE comment_id = ? AND lower(actor_email) = lower(?) AND reaction = 'smile'`,
    )
      .bind(commentId, scope.email)
      .first<{ id: string }>();
    if (existing) {
      await env.REPORTS.prepare(
        "DELETE FROM editorial_comment_reactions WHERE id = ?",
      )
        .bind(existing.id)
        .run();
      await notifyEditorialCommentChange(env, documentId);
      return json({
        ok: true,
        action,
        reaction: "smile",
        actorEmail: scope.email,
        toggledOff: true,
      });
    }
    await env.REPORTS.prepare(
      `INSERT INTO editorial_comment_reactions
       (id, comment_id, actor_email, reaction, created_at)
       VALUES (?, ?, ?, 'smile', ?)`,
    )
      .bind(
        crypto.randomUUID(),
        commentId,
        scope.email,
        new Date().toISOString(),
      )
      .run();
    await notifyEditorialCommentChange(env, documentId);
    return json({
      ok: true,
      action,
      reaction: "smile",
      actorEmail: scope.email,
    });
  }
  const latestAction = await env.REPORTS.prepare(
    `SELECT action FROM editorial_comment_actions
     WHERE comment_id = ? AND lower(actor_email) = lower(?) AND action IN ('acknowledge','unacknowledge')
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(commentId, scope.email)
    .first<{ action: string }>();
  if (
    (action === "acknowledge" || action === "unacknowledge") &&
    latestAction?.action === action
  ) {
    const statements = [
      env.REPORTS.prepare(
        "DELETE FROM editorial_comment_actions WHERE comment_id = ? AND lower(actor_email) = lower(?) AND action IN ('acknowledge','unacknowledge')",
      ).bind(commentId, scope.email),
    ];
    if (action === "acknowledge")
      statements.push(
        env.REPORTS.prepare(
          "UPDATE editorial_comments SET acknowledged_at = NULL, acknowledged_by = NULL WHERE id = ? AND lower(acknowledged_by) = lower(?)",
        ).bind(commentId, scope.email),
      );
    await env.REPORTS.batch(statements);
    await notifyEditorialCommentChange(env, documentId);
    return json({
      ok: true,
      action,
      actorEmail: scope.email,
      toggledOff: true,
    });
  }
  const now = new Date().toISOString();
  let stateUpdate =
    action === "acknowledge"
      ? env.REPORTS.prepare(
          "UPDATE editorial_comments SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ?",
        ).bind(now, scope.email, commentId)
      : action === "unacknowledge"
        ? env.REPORTS.prepare(
            "UPDATE editorial_comments SET acknowledged_at = NULL, acknowledged_by = NULL WHERE id = ?",
          ).bind(commentId)
        : action === "resolve"
          ? env.REPORTS.prepare(
              "UPDATE editorial_comments SET resolved_at = resolved_at, resolved_by = resolved_by WHERE id = ?",
            ).bind(commentId)
          : env.REPORTS.prepare(
              "UPDATE editorial_comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ?",
            ).bind(commentId);
  if (action === "resolve" || action === "reopen") {
    const resolutionRows = await env.REPORTS.prepare(
      `SELECT actor_email, action FROM editorial_comment_actions
       WHERE comment_id = ? AND action IN ('resolve', 'reopen') ORDER BY created_at ASC`,
    )
      .bind(commentId)
      .all<{ actor_email: string; action: "resolve" | "reopen" }>();
    const activeResolvers = new Map<string, string>();
    for (const row of resolutionRows.results ?? []) {
      const email = row.actor_email.trim().toLowerCase();
      if (row.action === "resolve") activeResolvers.set(email, row.actor_email);
      else activeResolvers.delete(email);
    }
    const actorEmail = scope.email.trim().toLowerCase();
    if (action === "resolve") activeResolvers.set(actorEmail, scope.email);
    else activeResolvers.delete(actorEmail);
    const commentAuthor = comment.created_by.trim().toLowerCase();
    // 自分のコメントは自分の反映済み操作だけで解決。他人のコメントは
    // 投稿者本人の反映済み操作が必要で、対応者だけでは解決しない。
    const isResolved = activeResolvers.has(commentAuthor);
    stateUpdate = isResolved
      ? env.REPORTS.prepare(
          "UPDATE editorial_comments SET resolved_at = ?, resolved_by = ? WHERE id = ?",
        ).bind(now, scope.email, commentId)
      : env.REPORTS.prepare(
          "UPDATE editorial_comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ?",
        ).bind(commentId);
  }
  try {
    // 状態と監査履歴を同一D1 batchに入れ、片方だけ成功する状態を防ぐ。
    await env.REPORTS.batch([
      stateUpdate,
      env.REPORTS.prepare(
        "INSERT INTO editorial_comment_actions (id, comment_id, actor_email, action, created_at) VALUES (?,?,?,?,?)",
      ).bind(crypto.randomUUID(), commentId, scope.email, action, now),
    ]);
  } catch {
    return json(
      {
        error:
          "コメントの状態と操作履歴を保存できませんでした。状態は変更されていません。",
      },
      500,
    );
  }
  await notifyEditorialCommentChange(env, documentId);
  return json({ ok: true, action, actorEmail: scope.email, recordedAt: now });
}

async function editEditorialComment(
  request: Request,
  env: Env,
  documentId: string,
  commentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  let payload: EditorialCommentPayload;
  try {
    payload = (await request.json()) as EditorialCommentPayload;
  } catch {
    return json({ error: "コメントを読み取れませんでした。" }, 400);
  }
  const body = text(payload.body, MAX_EDITORIAL_COMMENT_LENGTH);
  const selections = editorialCommentSelections(payload);
  if (selections instanceof Response) return selections;
  const tags = editorialCommentTags(payload);
  if (tags instanceof Response) return tags;
  if (!body && !(tags ?? []).length && !selections.length)
    return json({ error: "コメント本文またはタグを入力してください。" }, 400);
  const comment = await env.REPORTS.prepare(
    `SELECT c.id, c.created_by, d.subject, d.status FROM editorial_comments c
     JOIN editorial_documents d ON d.id = c.document_id WHERE c.id = ? AND c.document_id = ?`,
  )
    .bind(commentId, documentId)
    .first<{
      id: string;
      created_by: string;
      subject: string;
      status: EditorialDocumentStatus;
    }>();
  if (!comment) return json({ error: "コメントが見つかりません。" }, 404);
  if (
    !canReviewDocument(scope, comment.subject, comment.status) ||
    (!scope.isManager && comment.created_by !== scope.email)
  )
    return json(
      { error: "コメントを編集できるのは投稿者本人または運営内運営です。" },
      403,
    );
  const firstSelection = selections[0] ?? null;
  await env.REPORTS.prepare(
    "UPDATE editorial_comments SET body = ?, selection_start = ?, selection_end = ?, selection_text = ? WHERE id = ?",
  )
    .bind(
      body,
      firstSelection?.start ?? null,
      firstSelection?.end ?? null,
      firstSelection?.text ?? null,
      commentId,
    )
    .run();
  await replaceEditorialCommentSelections(env, commentId, selections);
  if (tags) await replaceEditorialCommentTags(env, commentId, tags);
  await notifyEditorialCommentChange(env, documentId);
  return json({ ok: true });
}

async function deleteEditorialComment(
  request: Request,
  env: Env,
  documentId: string,
  commentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const comment = await env.REPORTS.prepare(
    `SELECT c.id, c.created_by, d.subject, d.status FROM editorial_comments c
     JOIN editorial_documents d ON d.id = c.document_id WHERE c.id = ? AND c.document_id = ?`,
  )
    .bind(commentId, documentId)
    .first<{
      id: string;
      created_by: string;
      subject: string;
      status: EditorialDocumentStatus;
    }>();
  if (!comment) return json({ error: "コメントが見つかりません。" }, 404);
  if (
    !canReviewDocument(scope, comment.subject, comment.status) ||
    (!scope.isManager && comment.created_by !== scope.email)
  )
    return json(
      { error: "コメントを削除できるのは投稿者本人または運営内運営です。" },
      403,
    );
  // 親コメントを削除する場合は、そのスレッドの返信も一緒に削除する。
  const childRows = await env.REPORTS.prepare(
    "SELECT id FROM editorial_comments WHERE parent_comment_id = ?",
  )
    .bind(commentId)
    .all<{ id: string }>();
  const ids = [commentId, ...(childRows.results ?? []).map((row) => row.id)];
  for (const id of ids) {
    await env.REPORTS.prepare(
      "DELETE FROM editorial_comment_selections WHERE comment_id = ?",
    )
      .bind(id)
      .run();
    await env.REPORTS.prepare(
      "DELETE FROM editorial_comment_tags WHERE comment_id = ?",
    )
      .bind(id)
      .run();
  }
  await env.REPORTS.prepare(
    "DELETE FROM editorial_comments WHERE id = ? OR parent_comment_id = ?",
  )
    .bind(commentId, commentId)
    .run();
  await notifyEditorialCommentChange(env, documentId);
  return json({ ok: true });
}

const githubBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const githubBinaryBase64 = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  return btoa(binary);
};

const githubText = (base64: string) => {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

async function storeArticleBackup(
  env: Env,
  repository: string,
  path: string,
  gitSha: string,
  body: string,
  source: "scheduled" | "publish",
) {
  await env.REPORTS.prepare(
    `INSERT OR IGNORE INTO article_source_backups
      (id, repository, path, git_sha, body, source, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      repository,
      path,
      gitSha,
      body,
      source,
      new Date().toISOString(),
    )
    .run();
}

/** GitHubの履歴に加え、公開済みMarkdownをD1へ世代バックアップする。 */
async function syncPublishedArticleBackups(env: Env) {
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token) return { synced: 0, skipped: true };
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "atlasez-editorial-backup",
    "x-github-api-version": "2022-11-28",
  };
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repository}/git/trees/main?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok)
    throw new Error("GitHubのバックアップ対象を取得できませんでした。");
  const tree = (await treeResponse.json()) as {
    tree?: { path?: string; type?: string; sha?: string }[];
  };
  const articles = (tree.tree ?? []).filter(
    (entry) =>
      entry.type === "blob" &&
      entry.path?.startsWith("src/content/articles/") &&
      entry.path.endsWith(".md") &&
      entry.sha,
  );
  let synced = 0;
  for (const entry of articles) {
    const path = entry.path!;
    const sha = entry.sha!;
    const existing = await env.REPORTS.prepare(
      "SELECT id FROM article_source_backups WHERE repository = ? AND path = ? AND git_sha = ? LIMIT 1",
    )
      .bind(repository, path, sha)
      .first<{ id: string }>();
    if (existing) continue;
    const contentResponse = await fetch(
      `https://api.github.com/repos/${repository}/contents/${path}`,
      { headers },
    );
    if (!contentResponse.ok) continue;
    const content = (await contentResponse.json()) as {
      content?: string;
      sha?: string;
    };
    if (!content.content) continue;
    await storeArticleBackup(
      env,
      repository,
      path,
      content.sha ?? sha,
      githubText(content.content),
      "scheduled",
    );
    synced += 1;
  }
  return { synced, skipped: false };
}

/** GitHub main上の公開用Markdownを基準に、編集室の公開済み表示を正規化する。 */
async function syncEditorialPublicationStatus(env: Env) {
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token)
    throw new Error("GitHub公開連携が未設定のため、公開状態を同期できません。");
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "atlasez-editorial-publication-sync",
    "x-github-api-version": "2022-11-28",
  };
  const documents = await env.REPORTS.prepare(
    "SELECT id, locale, subject, category, slug, published_at, publication_action FROM editorial_documents",
  ).all<
    Pick<
      EditorialDocument,
      | "id"
      | "locale"
      | "subject"
      | "category"
      | "slug"
      | "published_at"
      | "publication_action"
    >
  >();
  let published = 0;
  let pending = 0;
  const now = new Date().toISOString();
  for (const document of documents.results) {
    const path = `src/content/articles/${document.locale}/${document.subject}/${document.category}/${document.slug}.md`;
    const response = await fetch(
      `https://api.github.com/repos/${repository}/contents/${path}`,
      { headers },
    );
    let isPublished = false;
    if (response.ok) {
      const content = (await response.json()) as { content?: string };
      const markdown = content.content ? githubText(content.content) : "";
      const frontMatter =
        markdown.match(/^---\s*\n([\s\S]*?)\n---/m)?.[1] ?? "";
      isPublished = /^status:\s*published\s*$/m.test(frontMatter);
    } else if (response.status !== 404) {
      throw new Error("GitHub上の公開状態を取得できませんでした。");
    }
    if (isPublished) {
      published += 1;
      await env.REPORTS.prepare(
        `UPDATE editorial_documents
         SET published_at = COALESCE(published_at, ?),
             publication_pr_number = CASE WHEN publication_action = 'publish' THEN NULL ELSE publication_pr_number END,
             publication_pr_url = CASE WHEN publication_action = 'publish' THEN NULL ELSE publication_pr_url END,
             publication_branch = CASE WHEN publication_action = 'publish' THEN NULL ELSE publication_branch END,
             publication_action = CASE WHEN publication_action = 'publish' THEN NULL ELSE publication_action END,
             publication_requested_at = CASE WHEN publication_action = 'publish' THEN NULL ELSE publication_requested_at END
         WHERE id = ?`,
      )
        .bind(now, document.id)
        .run();
    } else if (document.publication_action === "unpublish") {
      pending += 1;
      await env.REPORTS.prepare(
        `UPDATE editorial_documents
         SET status = 'draft', published_at = NULL,
             publication_pr_number = NULL, publication_pr_url = NULL,
             publication_branch = NULL, publication_action = NULL,
             publication_requested_at = NULL
         WHERE id = ?`,
      )
        .bind(document.id)
        .run();
    } else {
      pending += 1;
      await env.REPORTS.prepare(
        "UPDATE editorial_documents SET published_at = NULL WHERE id = ?",
      )
        .bind(document.id)
        .run();
    }
  }
  return { published, pending, total: documents.results.length };
}

async function syncEditorialPublicationStatusForAdmin(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  try {
    return json(await syncEditorialPublicationStatus(env));
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "公開状態を同期できませんでした。",
      },
      502,
    );
  }
}

const editorialMarkdown = (
  document: EditorialDocument,
  publicationStatus: "published" | "draft" = "published",
) => {
  const date = new Date().toISOString().slice(0, 10);
  const references = storedArticleReferences(document.article_references);
  const yaml = (value: string) => JSON.stringify(value);
  return [
    "---",
    `articleId: ${document.locale}-${document.subject}-${document.slug}`,
    `locale: ${document.locale}`,
    `title: ${document.title}`,
    `slug: ${document.slug}`,
    `subject: ${document.subject}`,
    `category: ${document.category}`,
    "concepts:",
    `  - id: ${document.concept_id}`,
    "authors: [editorial-workspace]",
    `reviewers: [${document.updated_by}]`,
    `status: ${publicationStatus}`,
    `createdAt: ${date}`,
    `updatedAt: ${date}`,
    `summary: ${document.summary}`,
    "difficulty: basic",
    "estimatedMinutes: 10",
    "tags: []",
    "aliases: []",
    "exerciseIds: { pre: [], post: [] }",
    references.length
      ? [
          "references:",
          ...references.flatMap((reference) => [
            `  - id: ${yaml(reference.id)}`,
            `    title: ${yaml(reference.title)}`,
            ...(reference.authors
              ? [`    authors: ${yaml(reference.authors)}`]
              : []),
            ...(reference.year ? [`    year: ${yaml(reference.year)}`] : []),
            ...(reference.publisher
              ? [`    publisher: ${yaml(reference.publisher)}`]
              : []),
            ...(reference.url ? [`    url: ${yaml(reference.url)}`] : []),
            ...(reference.note ? [`    note: ${yaml(reference.note)}`] : []),
          ]),
        ].join("\n")
      : "references: []",
    "---",
    "",
    document.body,
  ].join("\n");
};

const listEditorialAssetsForDocument = async (env: Env, documentId: string) =>
  (
    await env.REPORTS.prepare(
      `SELECT id, document_id, filename, media_type, bytes, data, alt_text, latex_name, created_by, created_at
       FROM editorial_assets WHERE document_id = ? ORDER BY created_at ASC`,
    )
      .bind(documentId)
      .all<EditorialAsset>()
  ).results;

type EditorialPublicationPullRequest = {
  number: number;
  html_url: string | null;
  state: "open" | "closed";
  merged_at: string | null;
};

const githubApiHeaders = (token: string, userAgent: string) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "user-agent": userAgent,
  "x-github-api-version": "2022-11-28",
});

async function getEditorialPublicationPullRequest(
  env: Env,
  number: number,
): Promise<EditorialPublicationPullRequest | null> {
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token) return null;
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const response = await fetch(
    `https://api.github.com/repos/${repository}/pulls/${number}`,
    { headers: githubApiHeaders(token, "atlasez-editorial-publication") },
  );
  if (!response.ok) return null;
  const value = (await response.json()) as Partial<EditorialPublicationPullRequest>;
  if (
    typeof value.number !== "number" ||
    (value.state !== "open" && value.state !== "closed")
  )
    return null;
  return {
    number: value.number,
    html_url: typeof value.html_url === "string" ? value.html_url : null,
    state: value.state,
    merged_at: typeof value.merged_at === "string" ? value.merged_at : null,
  };
}

async function deleteEditorialPublicationBranch(
  repository: string,
  branch: string,
  headers: Record<string, string>,
) {
  await fetch(
    `https://api.github.com/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`,
    { method: "DELETE", headers },
  ).catch(() => undefined);
}

async function uploadEditorialAssetToGitHub(
  asset: EditorialAsset,
  repository: string,
  headers: Record<string, string>,
  documentId: string,
  branch: string,
) {
  const path = `public/images/editorial/${documentId}/${asset.filename}`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const existing = await fetch(
    `${endpoint}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  let sha: string | undefined;
  if (existing.ok) sha = ((await existing.json()) as { sha?: string }).sha;
  else if (existing.status !== 404)
    throw new Error("GitHub上の画像公開先を確認できませんでした。");
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Publish article asset: ${asset.filename}`,
      content: githubBinaryBase64(asset.data),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) throw new Error("GitHubへ画像を反映できませんでした。");
}

async function writeEditorialDocumentToGitHub(
  document: EditorialDocument,
  env: Env,
  publicationStatus: "published" | "draft",
  message: string,
): Promise<{
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  branch: string;
  body: string;
} | Response> {
  const repository = env.GITHUB_REPOSITORY ?? "Atlasez/Atlasez01";
  const token = env.GITHUB_PUBLISH_TOKEN;
  if (!token)
    return json(
      {
        error:
          "GitHub公開連携がまだ設定されていません。運営管理者がGITHUB_PUBLISH_TOKENをCloudflare Secretへ登録してください。",
      },
      503,
    );
  const path = `src/content/articles/${document.locale}/${document.subject}/${document.category}/${document.slug}.md`;
  const endpoint = `https://api.github.com/repos/${repository}/contents/${path}`;
  const headers = githubApiHeaders(token, "atlasez-editorial-workspace");
  const assets = await listEditorialAssetsForDocument(env, document.id);
  const assetsById = new Map(
    assets.map((asset) => [
      asset.id.toLowerCase(),
      { ...asset, documentId: asset.document_id },
    ]),
  );
  const referencedAssetIds = editorialAssetIdsIn(document.body);
  const missingAsset = referencedAssetIds.find(
    (id) => !assetsById.has(id.toLowerCase()),
  );
  if (missingAsset)
    return json(
      {
        error:
          "本文が参照している画像素材が見つかりません。再挿入してください。",
      },
      409,
    );
  const assetsByLatexName = new Map(
    assets.map((asset) => {
      const latexName =
        asset.latex_name || sanitizeEditorialLatexName("", asset.filename);
      return [
        latexName.toLowerCase(),
        {
          id: asset.id,
          documentId: asset.document_id,
          filename: asset.filename,
          latexName,
          alt: asset.alt_text,
        },
      ];
    }),
  );
  const missingLatexName = editorialLatexNamesIn(document.body).find(
    (name) => !assetsByLatexName.has(name),
  );
  if (missingLatexName)
    return json(
      {
        error: `本文が参照しているLaTeX画像「${missingLatexName}」が見つかりません。素材を再挿入してください。`,
      },
      409,
    );
  const baseRef = await fetch(
    `https://api.github.com/repos/${repository}/git/ref/heads/main`,
    { headers },
  );
  if (!baseRef.ok)
    return json(
      { error: "GitHubの公開先ブランチを確認できませんでした。" },
      502,
    );
  const baseRefData = (await baseRef.json()) as { object?: { sha?: string } };
  const baseSha = baseRefData.object?.sha;
  if (!baseSha)
    return json({ error: "GitHubの公開先ブランチが不正です。" }, 502);
  const branch = `editorial/${publicationStatus}-${document.id}-${Date.now()}`;
  const createBranch = await fetch(
    `https://api.github.com/repos/${repository}/git/refs`,
    {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    },
  );
  if (!createBranch.ok)
    return json(
      {
        error:
          "GitHubの公開用ブランチを作成できませんでした。トークンのContents権限、Pull requests権限、対象リポジトリを確認してください。",
      },
      502,
    );
  const referencedAssetIdsForPublish = [
    ...new Set([
      ...referencedAssetIds,
      ...editorialLatexNamesIn(document.body).map(
        (name) => assetsByLatexName.get(name)!.id,
      ),
    ]),
  ];
  try {
    for (const assetId of referencedAssetIdsForPublish)
      await uploadEditorialAssetToGitHub(
        assetsById.get(assetId.toLowerCase())!,
        repository,
        headers,
        document.id,
        branch,
      );
    const body = editorialMarkdown(
      {
        ...document,
        body: replaceEditorialLatexReferences(
          replaceEditorialAssetMarkers(document.body, assetsById),
          assetsByLatexName,
        ),
      },
      publicationStatus,
    );
    const articleExisting = await fetch(
      `${endpoint}?ref=${encodeURIComponent(branch)}`,
      { headers },
    );
    let sha: string | undefined;
    if (articleExisting.ok)
      sha = ((await articleExisting.json()) as { sha?: string }).sha;
    else if (articleExisting.status !== 404)
      throw new Error("GitHub上の公開先を確認できませんでした。");
    const publish = await fetch(endpoint, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message,
        content: githubBase64(body),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!publish.ok) throw new Error("GitHubへ記事を反映できませんでした。");
    const result = (await publish.json()) as { content?: { sha?: string } };
    const pullRequest = await fetch(
      `https://api.github.com/repos/${repository}/pulls`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          title: message,
          head: branch,
          base: "main",
          body: [
            "このPRは運営サイトの記事公開フローから自動作成されました。",
            "",
            `- 原稿ID: ${document.id}`,
            `- 対象: ${document.locale}/${document.subject}/${document.category}/${document.slug}`,
            `- 操作: ${publicationStatus === "published" ? "公開" : "公開取り消し"}`,
            "",
            "CIと差分を確認してからMergeしてください。Merge後、学習サイトへ自動反映されます。",
          ].join("\n"),
        }),
      },
    );
    if (!pullRequest.ok)
      throw new Error("GitHubへ公開用PRを作成できませんでした。");
    const pullRequestData = (await pullRequest.json()) as {
      number?: number;
      html_url?: string;
    };
    if (typeof pullRequestData.number !== "number")
      throw new Error("GitHubのPR番号を取得できませんでした。");
    try {
      await storeArticleBackup(
        env,
        repository,
        path,
        result.content?.sha ?? crypto.randomUUID(),
        body,
        "publish",
      );
    } catch (error) {
      console.error("article source backup failed after PR creation", {
        documentId: document.id,
        error,
      });
    }
    return {
      pullRequestUrl: pullRequestData.html_url ?? null,
      pullRequestNumber: pullRequestData.number,
      branch,
      body,
    };
  } catch (error) {
    await deleteEditorialPublicationBranch(repository, branch, headers);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "GitHubへの公開用PR作成に失敗しました。",
      },
      502,
    );
  }
}

async function publishEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager)
    return json({ error: "公開できるのは運営管理者だけです。" }, 403);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (document.publication_pr_number && document.publication_pr_url) {
    const existingPullRequest = await getEditorialPublicationPullRequest(
      env,
      document.publication_pr_number,
    );
    if (existingPullRequest?.merged_at) {
      await syncEditorialPublicationStatus(env).catch((error) =>
        console.error("publication status sync after merged PR failed", {
          documentId,
          error,
        }),
      );
      return json({
        ok: true,
        merged: true,
        pullRequestUrl: document.publication_pr_url,
        pullRequestNumber: document.publication_pr_number,
      });
    }
    if (existingPullRequest?.state === "open")
      return json({
        ok: true,
        pending: true,
        pullRequestUrl:
          existingPullRequest.html_url ?? document.publication_pr_url,
        pullRequestNumber: document.publication_pr_number,
      });
    await env.REPORTS.prepare(
      `UPDATE editorial_documents
       SET publication_pr_number = NULL, publication_pr_url = NULL,
           publication_branch = NULL, publication_action = NULL,
           publication_requested_at = NULL
       WHERE id = ?`,
    )
      .bind(documentId)
      .run();
  }
  if (document.status !== "approved")
    return json({ error: "公開前に原稿を承認済みにしてください。" }, 400);
  if (document.published_at)
    return json({ error: "この記事はすでに公開済みです。" }, 400);
  const result = await writeEditorialDocumentToGitHub(
    document,
    env,
    "published",
    `Publish article: ${document.title}`,
  );
  if (result instanceof Response) return result;
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    `UPDATE editorial_documents
     SET publication_pr_number = ?, publication_pr_url = ?, publication_branch = ?,
         publication_action = 'publish', publication_requested_at = ?,
         scheduled_publish_at = NULL, scheduled_publish_claimed_at = NULL,
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      result.pullRequestNumber,
      result.pullRequestUrl,
      result.branch,
      now,
      now,
      scope.email,
      documentId,
    )
    .run();
  return json({
    ok: true,
    pending: true,
    pullRequestUrl: result.pullRequestUrl,
    pullRequestNumber: result.pullRequestNumber,
  });
}

async function publicationReviewRoleEmails(
  env: Env,
  role: EditorialWorkflowRole,
  subject: string,
) {
  const result = await env.REPORTS.prepare(
    role === "project-leader"
      ? "SELECT lower(email) AS email FROM editorial_workflow_roles WHERE role = 'project-leader'"
      : "SELECT lower(email) AS email FROM editorial_workflow_roles WHERE role = 'subject-coordinator' AND (subject = ? OR subject = '*')",
  )
    .bind(...(role === "project-leader" ? [] : [subject]))
    .all<{ email: string }>();
  return [...new Set((result.results ?? []).map((row) => row.email).filter(Boolean))];
}

async function scheduleEditorialPublication(request: Request, env: Env, documentId: string): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  const payload = (await request.json().catch(() => null)) as { scheduledPublishAt?: unknown } | null;
  const raw = text(payload?.scheduledPublishAt, 80);
  const document = await env.REPORTS.prepare(`${editorialDocumentSelect} WHERE id=?`).bind(documentId).first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (document.status !== "approved" || document.publication_review_stage)
    return json({ error: "公開審査が完了した原稿だけ公開予約できます。" }, 400);
  if (document.published_at) return json({ error: "公開済みの記事です。" }, 400);
  if (!raw) {
    await env.REPORTS.prepare("UPDATE editorial_documents SET scheduled_publish_at=NULL, scheduled_publish_claimed_at=NULL, updated_at=?, updated_by=? WHERE id=?").bind(new Date().toISOString(), scope.email, documentId).run();
    return json({ ok: true, scheduledPublishAt: null });
  }
  const timestamp = new Date(raw);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() <= Date.now())
    return json({ error: "公開日時は現在より後に設定してください。" }, 400);
  const scheduledPublishAt = timestamp.toISOString();
  await env.REPORTS.prepare("UPDATE editorial_documents SET scheduled_publish_at=?, scheduled_publish_claimed_at=NULL, updated_at=?, updated_by=? WHERE id=?").bind(scheduledPublishAt, new Date().toISOString(), scope.email, documentId).run();
  return json({ ok: true, scheduledPublishAt });
}

async function dispatchScheduledEditorialPublications(env: Env) {
  const now = new Date().toISOString();
  const due = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE status='approved' AND published_at IS NULL AND publication_pr_number IS NULL AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= ? AND scheduled_publish_claimed_at IS NULL LIMIT 20`,
  ).bind(now).all<EditorialDocument>();
  let requested = 0;
  for (const document of due.results ?? []) {
    const claim = (await env.REPORTS.prepare(
      "UPDATE editorial_documents SET scheduled_publish_claimed_at=? WHERE id=? AND published_at IS NULL AND scheduled_publish_claimed_at IS NULL",
    ).bind(now, document.id).run()) as { meta?: { changes?: number } };
    if (!claim.meta?.changes) continue;
    try {
      const result = await writeEditorialDocumentToGitHub(document, env, "published", `Publish scheduled article: ${document.title}`);
      if (result instanceof Response) throw new Error("GitHubへの公開に失敗しました。");
      await env.REPORTS.prepare(
        `UPDATE editorial_documents
         SET publication_pr_number = ?, publication_pr_url = ?, publication_branch = ?,
             publication_action = 'publish', publication_requested_at = ?,
             scheduled_publish_at = NULL, scheduled_publish_claimed_at = NULL,
             updated_at = ?, updated_by = ?
         WHERE id = ?`,
      ).bind(result.pullRequestNumber, result.pullRequestUrl, result.branch, now, now, "scheduled-publisher", document.id).run();
      requested += 1;
    } catch (error) {
      console.error("scheduled editorial publication failed", { documentId: document.id, error });
      await env.REPORTS.prepare("UPDATE editorial_documents SET scheduled_publish_claimed_at=NULL WHERE id=?").bind(document.id).run();
    }
  }
  return { requested, due: due.results?.length ?? 0 };
}

async function getPublicationReviewState(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document || !canReviewDocument(scope, document.subject, document.status))
    return json({ error: "この原稿を閲覧する権限がありません。" }, 403);
  const [coordinators, leaders] = await Promise.all([
    publicationReviewRoleEmails(env, "subject-coordinator", document.subject),
    publicationReviewRoleEmails(env, "project-leader", document.subject),
  ]);
  return json({
    stage: document.publication_review_stage,
    round: document.publication_review_round,
    canCompleteWriting:
      !document.published_at &&
      !document.publication_review_stage &&
      (document.status === "in-review" || document.status === "draft") &&
      (canEditSubject(scope, document.subject) || document.created_by === scope.email),
    canDecide:
      (document.publication_review_stage === "subject-coordinator" && canCoordinateSubject(scope, document.subject)) ||
      (document.publication_review_stage === "project-leader" && Boolean(scope.isProjectLeader)),
    coordinatorCount: coordinators.length,
    leaderCount: leaders.length,
  });
}

async function startPublicationReview(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canEditSubject(scope, document.subject) && document.created_by !== scope.email)
    return json({ error: "執筆担当者だけが執筆完了にできます。" }, 403);
  if (document.published_at) return json({ error: "公開済みの記事です。" }, 400);
  if (document.publication_review_stage)
    return json({ error: "すでに公開審査中です。" }, 409);
  if (document.status !== "in-review" && document.status !== "draft")
    return json({ error: "先に原稿を保存してください。" }, 400);
  const coordinators = await publicationReviewRoleEmails(env, "subject-coordinator", document.subject);
  const leaders = await publicationReviewRoleEmails(env, "project-leader", document.subject);
  const stage: EditorialPublicationReviewStage = coordinators.length
    ? "subject-coordinator"
    : "project-leader";
  if (stage === "project-leader" && !leaders.length)
    return json({ error: "プロジェクトリーダーが設定されていないため、公開審査を開始できません。" }, 503);
  const now = new Date().toISOString();
  const round = (document.publication_review_round ?? 0) + 1;
  await env.REPORTS.prepare(
    `UPDATE editorial_documents SET status='in-review', publication_review_stage=?, publication_review_round=?, scheduled_publish_at=NULL, scheduled_publish_claimed_at=NULL, updated_at=?, updated_by=? WHERE id=?`,
  )
    .bind(stage, round, now, scope.email, documentId)
    .run();
  const recipients = stage === "subject-coordinator" ? coordinators : leaders;
  const recipientLabel = stage === "subject-coordinator" ? "分野統括" : "プロジェクトリーダー";
  await postDiscordWebhook(
    env.DISCORD_ATLAS_WEBHOOK_URL,
    `公開審査依頼（${recipientLabel}）：${document.title}\n${document.subject} / ${documentId}`,
  );
  return json({ ok: true, stage, round, recipients, recipientLabel });
}

async function decidePublicationReview(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request)) return json({ error: "この送信元からは受け付けられません。" }, 403);
  const payload = (await request.json().catch(() => null)) as { decision?: unknown; note?: unknown } | null;
  const decision = text(payload?.decision, 20);
  const note = text(payload?.note, 2_000);
  if (decision !== "approved" && decision !== "rejected") return json({ error: "審査結果を選択してください。" }, 400);
  const document = await env.REPORTS.prepare(`${editorialDocumentSelect} WHERE id = ?`).bind(documentId).first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  const stage = document.publication_review_stage;
  if (!stage) return json({ error: "この原稿は公開審査中ではありません。" }, 409);
  const authorized = stage === "subject-coordinator"
    ? canCoordinateSubject(scope, document.subject)
    : Boolean(scope.isProjectLeader);
  if (!authorized) return json({ error: "この審査を処理する権限がありません。" }, 403);
  const already = await env.REPORTS.prepare(
    "SELECT id FROM editorial_publication_reviews WHERE document_id=? AND review_round=? AND stage=? LIMIT 1",
  ).bind(documentId, document.publication_review_round, stage).first<{ id: string }>();
  if (already) return json({ error: "この段階の審査はすでに処理されています。" }, 409);
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    "INSERT INTO editorial_publication_reviews (id,document_id,review_round,stage,decision,actor_email,note,created_at) VALUES (?,?,?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), documentId, document.publication_review_round, stage, decision, scope.email, note, now).run();
  if (decision === "rejected") {
    await env.REPORTS.prepare(
      "UPDATE editorial_documents SET status='in-review', publication_review_stage=NULL, scheduled_publish_at=NULL, scheduled_publish_claimed_at=NULL, updated_at=?, updated_by=? WHERE id=?",
    ).bind(now, scope.email, documentId).run();
    await postDiscordWebhook(env.DISCORD_ATLAS_WEBHOOK_URL, `公開審査差し戻し：${document.title}\nフィードバック中へ戻しました。`);
    return json({ ok: true, status: "in-review", stage: null, returnedToFeedback: true });
  }
  const leaders = await publicationReviewRoleEmails(env, "project-leader", document.subject);
  if (stage === "subject-coordinator" && leaders.length) {
    await env.REPORTS.prepare(
      "UPDATE editorial_documents SET publication_review_stage='project-leader', updated_at=?, updated_by=? WHERE id=?",
    ).bind(now, scope.email, documentId).run();
    await postDiscordWebhook(env.DISCORD_ATLAS_WEBHOOK_URL, `公開審査依頼（プロジェクトリーダー）：${document.title}`);
    return json({ ok: true, status: "in-review", stage: "project-leader" });
  }
  await env.REPORTS.prepare(
    "UPDATE editorial_documents SET status='approved', publication_review_stage=NULL, reviewed_at=?, updated_at=?, updated_by=? WHERE id=?",
  ).bind(now, now, scope.email, documentId).run();
  return json({ ok: true, status: "approved", stage: null, approvedForPublication: true });
}

async function unpublishEditorialDocument(
  request: Request,
  env: Env,
  documentId: string,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!scope.isManager)
    return json({ error: "公開を取り消せるのは運営管理者だけです。" }, 403);
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const document = await env.REPORTS.prepare(
    `${editorialDocumentSelect} WHERE id = ?`,
  )
    .bind(documentId)
    .first<EditorialDocument>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (
    document.publication_action === "unpublish" &&
    document.publication_pr_number &&
    document.publication_pr_url
  ) {
    const existingPullRequest = await getEditorialPublicationPullRequest(
      env,
      document.publication_pr_number,
    );
    if (existingPullRequest?.state === "open")
      return json({
        ok: true,
        pending: true,
        pullRequestUrl:
          existingPullRequest.html_url ?? document.publication_pr_url,
        pullRequestNumber: document.publication_pr_number,
      });
    if (existingPullRequest?.merged_at) {
      await syncEditorialPublicationStatus(env).catch((error) =>
        console.error("publication status sync after merged PR failed", {
          documentId,
          error,
        }),
      );
      return json({
        ok: true,
        merged: true,
        pullRequestUrl: document.publication_pr_url,
        pullRequestNumber: document.publication_pr_number,
      });
    }
    await env.REPORTS.prepare(
      `UPDATE editorial_documents
       SET publication_pr_number = NULL, publication_pr_url = NULL,
           publication_branch = NULL, publication_action = NULL,
           publication_requested_at = NULL
       WHERE id = ?`,
    )
      .bind(documentId)
      .run();
  }
  if (!document.published_at)
    return json({ error: "この原稿は公開済みではありません。" }, 400);
  const result = await writeEditorialDocumentToGitHub(
    document,
    env,
    "draft",
    `Unpublish article: ${document.title}`,
  );
  if (result instanceof Response) return result;
  const now = new Date().toISOString();
  await env.REPORTS.prepare(
    "INSERT INTO editorial_document_revisions (id, document_id, title, summary, body, status, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      crypto.randomUUID(),
      documentId,
      document.title,
      document.summary,
      document.body,
      document.status,
      scope.email,
      now,
    )
    .run();
  await env.REPORTS.prepare(
    `UPDATE editorial_documents
     SET publication_pr_number = ?, publication_pr_url = ?, publication_branch = ?,
         publication_action = 'unpublish', publication_requested_at = ?,
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
  )
    .bind(
      result.pullRequestNumber,
      result.pullRequestUrl,
      result.branch,
      now,
      now,
      scope.email,
      documentId,
    )
    .run();
  return json({
    ok: true,
    pending: true,
    pullRequestUrl: result.pullRequestUrl,
    pullRequestNumber: result.pullRequestNumber,
  });
}

const googleOAuthConfigured = (env: Env) =>
  Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);

const adminReturnPath = (value: string | null) => {
  const fallback = "/admin/reports";
  if (!value) return fallback;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  )
    return fallback;
  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://admin.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "https://admin.local") return fallback;
  if (!isAdminPagePath(parsed.pathname)) return fallback;
  const project = parsed.searchParams.get("project");
  const keepProject =
    (parsed.pathname === "/admin/operations" ||
      parsed.pathname === "/admin/operations/" ||
      parsed.pathname === "/admin/progress" ||
      parsed.pathname === "/admin/progress/" ||
      parsed.pathname === "/admin/calendar" ||
      parsed.pathname === "/admin/calendar/" ||
      parsed.pathname === "/admin/manage" ||
      parsed.pathname === "/admin/manage/" ||
      parsed.pathname === "/admin/workspace" ||
      parsed.pathname === "/admin/workspace/" ||
      parsed.pathname === "/admin/introductions" ||
      parsed.pathname === "/admin/introductions/" ||
      parsed.pathname === "/admin/project-profile-requests" ||
      parsed.pathname === "/admin/project-profile-requests/" ||
      parsed.pathname === "/admin/co-working" ||
      parsed.pathname === "/admin/co-working/") &&
    (project === "atlas" ||
      project === "seminar-platform" ||
      project === "secretariat");
  return keepProject
    ? `${parsed.pathname}?project=${encodeURIComponent(project)}`
    : parsed.pathname;
};

const isApplicationPath = (pathname: string) =>
  /^\/apply(?:\/[^/]+)?\/?$/.test(pathname);
const isProjectApplicationPath = (pathname: string) => {
  const match = pathname.match(/^\/apply\/([^/]+)\/?$/);
  return Boolean(match && APPLICATION_FORM_SLUGS.has(match[1]));
};
const isApplicantPath = (pathname: string) =>
  pathname === "/applicant" || pathname === "/applicant/";
const isOnboardingPath = (pathname: string) =>
  pathname === "/onboarding" || pathname.startsWith("/onboarding/");

const userAreaForPath = (pathname: string): UserArea | null => {
  if (isApplicationPath(pathname)) return "application";
  if (isApplicantPath(pathname)) return "applicant";
  if (isOnboardingPath(pathname)) return "onboarding";
  if (isAdminPagePath(pathname)) return "admin";
  return null;
};

/** Safe OAuth return target for every authenticated user area. */
const userReturnPath = (value: string | null) => {
  if (!value) return "/apply/";
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  )
    return "/apply/";
  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://admin.local");
  } catch {
    return "/apply/";
  }
  if (parsed.origin !== "https://admin.local") return "/apply/";
  if (parsed.pathname === "/") return "/";
  if (isAdminPagePath(parsed.pathname)) return adminReturnPath(candidate);
  if (isApplicantPath(parsed.pathname)) return "/applicant/";
  if (isOnboardingPath(parsed.pathname))
    return parsed.pathname === "/onboarding/tutorial" ||
      parsed.pathname === "/onboarding/tutorial/"
      ? "/onboarding/tutorial/"
      : parsed.pathname === "/onboarding/project" ||
          parsed.pathname === "/onboarding/project/"
        ? "/onboarding/project/"
        : "/onboarding/";
  if (!isApplicationPath(parsed.pathname)) return "/apply/";
  const project = parsed.searchParams.get("project");
  if (parsed.pathname === "/apply" || parsed.pathname === "/apply/")
    return APPLICATION_FORM_SLUGS.has(project ?? "")
      ? `/apply/?project=${encodeURIComponent(project ?? "")}`
      : "/apply/";
  return parsed.pathname;
};

async function authorizeUserPage(
  request: Request,
  env: Env,
  area: UserArea,
): Promise<CurrentUserStage | Response> {
  const current = await getCurrentUserStage(request, env);
  if (isResponse(current)) {
    if (current.status !== 401 || !googleOAuthEnabled(env)) return current;
    const url = new URL(request.url);
    return new Response(null, {
      status: 302,
      headers: {
        location: `/auth/google/login?returnTo=${encodeURIComponent(userReturnPath(`${url.pathname}${url.search}`))}`,
      },
    });
  }
  const pathname = new URL(request.url).pathname;
  const isAtlasPracticePreview =
    pathname === "/onboarding/atlas-writing-practice/" &&
    new URL(request.url).searchParams.get("preview") === "1";
  if (isAtlasPracticePreview) {
    const managerScope = await getGlobalAdminScope(request, env);
    if (isResponse(managerScope)) return managerScope;
    return current;
  }
  if (
    current.stage === "TUTORIAL" &&
    (pathname === "/onboarding" || pathname === "/onboarding/")
  )
    return Response.redirect(
      `${new URL(request.url).origin}/onboarding/tutorial/`,
      302,
    );
  if (
    current.stage === "ONBOARDING" &&
    (pathname === "/onboarding" || pathname === "/onboarding/") &&
    current.baseProfileComplete
  )
    return Response.redirect(
      `${new URL(request.url).origin}/onboarding/project/`,
      302,
    );
  if (
    current.stage === "ONBOARDING" &&
    (pathname.startsWith("/onboarding/tutorial") ||
      (pathname.startsWith("/onboarding/project") &&
        !current.baseProfileComplete))
  )
    return Response.redirect(`${new URL(request.url).origin}/onboarding/`, 302);
  if (
    pathname === "/admin/member-profile" ||
    pathname === "/admin/member-profile/"
  ) {
    if (current.applicationStatus === "accepted" && current.baseProfileComplete)
      return current;
    if (
      applicantBasicProfileComplete(
        await getApplicantProfile(env, current.email),
      )
    )
      return current;
  }
  if (
    isProjectApplicationPath(pathname) &&
    ["ONBOARDING", "TUTORIAL", "MEMBER"].includes(current.stage)
  )
    return current;
  if (
    pathname === "/onboarding/atlas-writing-practice/" &&
    (current.stage !== "TUTORIAL" || current.projectSlug !== "atlas")
  )
    return Response.redirect(
      `${new URL(request.url).origin}${stageHome(current.stage, current.projectSlug)}`,
      302,
    );
  if (canAccess(current.stage, area)) return current;
  return Response.redirect(
    `${new URL(request.url).origin}${stageHome(current.stage, current.projectSlug)}`,
    302,
  );
}

function adminPublicOrigin(request: Request, env: Env) {
  return (env.ADMIN_PUBLIC_ORIGIN ?? new URL(request.url).origin).replace(
    /\/$/,
    "",
  );
}

const discordOAuthResultUrl = (
  request: Request,
  returnPath: string | undefined,
  result: "connected" | "error",
  message?: string,
) => {
  const target = new URL(userReturnPath(returnPath ?? "/applicant/"), request.url);
  target.searchParams.set("discord", result);
  if (message) target.searchParams.set("discordMessage", message.slice(0, 180));
  return target.toString();
};

async function startDiscordOAuth(request: Request, env: Env): Promise<Response> {
  if (!discordOAuthConfigured(env))
    return json(
      { error: "Discord OAuth2連携はまだ設定されていません。" },
      503,
    );
  const identity = await getAuthenticatedEmail(request, env);
  if (isResponse(identity)) return identity;
  const applicant = await env.REPORTS.prepare(
    `SELECT 1 AS found FROM atlasez_member_applications WHERE lower(email)=lower(?)
     UNION SELECT 1 FROM atlasez_project_memberships WHERE lower(email)=lower(?) LIMIT 1`,
  )
    .bind(identity, identity)
    .first<{ found: number }>();
  if (!applicant)
    return json({ error: "応募後にDiscord連携を開始してください。" }, 409);
  const returnPath = userReturnPath(new URL(request.url).searchParams.get("returnTo"));
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = new Date();
  await env.REPORTS.prepare(
    `INSERT INTO atlasez_discord_oauth_states
       (state_hash,email,return_path,expires_at,created_at)
     VALUES (?,?,?,?,?)`,
  )
    .bind(
      await hash(state),
      identity,
      returnPath,
      new Date(now.getTime() + DISCORD_OAUTH_STATE_TTL_MS).toISOString(),
      now.toISOString(),
    )
    .run();
  const authorization = new URL("https://discord.com/oauth2/authorize");
  authorization.search = new URLSearchParams({
    client_id: env.DISCORD_OAUTH_CLIENT_ID ?? "",
    redirect_uri: discordOAuthCallbackUrl(request, env),
    response_type: "code",
    scope: DISCORD_OAUTH_SCOPE,
    state,
    prompt: "consent",
  }).toString();
  return Response.redirect(authorization.toString(), 302);
}

async function completeDiscordOAuth(
  request: Request,
  env: Env,
  ctx?: WorkerExecutionContext,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state") ?? "";
  const code = requestUrl.searchParams.get("code") ?? "";
  const stateRow = state
    ? await env.REPORTS.prepare(
        `SELECT email,return_path,expires_at FROM atlasez_discord_oauth_states
         WHERE state_hash=? AND consumed_at IS NULL LIMIT 1`,
      )
        .bind(await hash(state))
        .first<{ email: string; return_path: string; expires_at: string }>()
    : null;
  const fail = (message: string) =>
    Response.redirect(
      discordOAuthResultUrl(request, stateRow?.return_path, "error", message),
      302,
    );
  if (!stateRow || !code || new Date(stateRow.expires_at).getTime() <= Date.now())
    return fail("Discord連携の有効期限が切れています。もう一度お試しください。");
  const identity = await getAuthenticatedEmail(request, env);
  if (isResponse(identity) || identity.toLowerCase() !== stateRow.email.toLowerCase())
    return fail("ログイン中のアカウントを確認できませんでした。");
  const consumed = (await env.REPORTS.prepare(
    "UPDATE atlasez_discord_oauth_states SET consumed_at=? WHERE state_hash=? AND consumed_at IS NULL",
  )
    .bind(new Date().toISOString(), await hash(state))
    .run()) as { meta?: { changes?: number } };
  if (consumed.meta?.changes !== 1) return fail("Discord連携を再度開始してください。");

  let token: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_OAUTH_CLIENT_ID ?? "",
        client_secret: env.DISCORD_OAUTH_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: discordOAuthCallbackUrl(request, env),
      }),
    });
    if (!response.ok) throw new Error("Discord token exchange failed");
    token = (await response.json()) as typeof token;
  } catch {
    return fail("Discordとの連携を完了できませんでした。");
  }
  if (!token.access_token || !token.refresh_token) return fail("Discordから連携情報を取得できませんでした。");
  let discordUser: { id?: string };
  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok) throw new Error("Discord user lookup failed");
    discordUser = (await response.json()) as typeof discordUser;
  } catch {
    return fail("Discordアカウントを確認できませんでした。");
  }
  const discordUserId = discordUser.id?.trim() ?? "";
  if (!/^\d{15,22}$/.test(discordUserId)) return fail("DiscordユーザーIDを確認できませんでした。");
  const duplicate = await env.REPORTS.prepare(
    "SELECT email FROM atlasez_member_discord_accounts WHERE discord_user_id=? AND lower(email)!=lower(?)",
  )
    .bind(discordUserId, identity)
    .first<{ email: string }>();
  if (duplicate) return fail("このDiscordアカウントは別のAtlasezアカウントに連携済みです。");
  try {
    const accessToken = await encryptDiscordSecret(env, token.access_token);
    const refreshToken = await encryptDiscordSecret(env, token.refresh_token);
    const now = new Date().toISOString();
    await env.REPORTS.prepare(
      `INSERT INTO atlasez_member_discord_accounts
         (email,discord_user_id,updated_at,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,oauth_scope,oauth_connected_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET
         discord_user_id=excluded.discord_user_id,updated_at=excluded.updated_at,
         access_token_ciphertext=excluded.access_token_ciphertext,
         refresh_token_ciphertext=excluded.refresh_token_ciphertext,
         token_expires_at=excluded.token_expires_at,oauth_scope=excluded.oauth_scope,
         oauth_connected_at=excluded.oauth_connected_at`,
    )
      .bind(
        identity.toLowerCase(),
        discordUserId,
        now,
        accessToken,
        refreshToken,
        new Date(Date.now() + Math.max(0, Number(token.expires_in ?? 0) - 60) * 1_000).toISOString(),
        token.scope ?? DISCORD_OAUTH_SCOPE,
        now,
      )
      .run();
  } catch {
    return fail("Discord連携情報を安全に保存できませんでした。運営管理者へ連絡してください。");
  }
  const accepted = await env.REPORTS.prepare(
    `UPDATE atlasez_member_applications
        SET provisioning_status='pending',provisioning_error='',provisioning_next_attempt_at=NULL,updated_at=?
      WHERE lower(email)=lower(?) AND status='accepted'`,
  )
    .bind(new Date().toISOString(), identity)
    .run();
  if ((accepted as { meta?: { changes?: number } }).meta?.changes) {
    ctx?.waitUntil(provisionAcceptedApplicationsForEmail(env, identity));
    ctx?.waitUntil(dispatchApplicationEmails(env));
  }
  return Response.redirect(
    discordOAuthResultUrl(request, stateRow.return_path, "connected"),
    302,
  );
}

function googleCallbackUrl(request: Request, env: Env) {
  return `${adminPublicOrigin(request, env)}/auth/google/callback`;
}

function searchConsoleCallbackUrl(request: Request, env: Env) {
  return `${adminPublicOrigin(request, env)}/auth/google/search-console/callback`;
}

const searchConsoleProperty = "sc-domain:atlasez.org";

async function startSearchConsoleImport(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json(
      {
        error:
          "Googleログインが設定されていないため、Search Consoleを取得できません。",
      },
      404,
    );
  const requestedDays = Number(
    new URL(request.url).searchParams.get("days") ?? 30,
  );
  const days = Number.isInteger(requestedDays)
    ? Math.min(90, Math.max(1, requestedDays))
    : 30;
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    // Reuse the already-authorized login callback. The callback dispatches
    // back to this flow by matching the Search Console state cookie.
    redirect_uri: googleCallbackUrl(request, env),
    response_type: "code",
    scope:
      "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
    state,
    prompt: "consent",
    access_type: "online",
  }).toString();
  const headers = new Headers({ location: authorization.toString() });
  headers.append(
    "set-cookie",
    cookie(
      SEARCH_CONSOLE_STATE_COOKIE,
      JSON.stringify({ state, days }),
      10 * 60,
      "/auth/google",
    ),
  );
  return new Response(null, { status: 302, headers });
}

async function completeSearchConsoleImport(
  request: Request,
  env: Env,
  redirectUri = searchConsoleCallbackUrl(request, env),
): Promise<Response> {
  const scope = await getGlobalAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code") ?? "";
  const state = requestUrl.searchParams.get("state") ?? "";
  let savedState: { state?: string; days?: number } = {};
  try {
    savedState = JSON.parse(
      cookieValue(request, SEARCH_CONSOLE_STATE_COOKIE),
    ) as typeof savedState;
  } catch {
    // 不正なCookieは失敗として扱う。
  }
  if (!code || !state || state !== savedState.state)
    return Response.redirect(
      `${adminPublicOrigin(request, env)}/admin/reports/?gsc=error`,
      302,
    );

  let token: { access_token?: string };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    token = (await tokenResponse.json()) as { access_token?: string };
  } catch {
    return Response.redirect(
      `${adminPublicOrigin(request, env)}/admin/reports/?gsc=error`,
      302,
    );
  }
  if (!token.access_token)
    return Response.redirect(
      `${adminPublicOrigin(request, env)}/admin/reports/?gsc=error`,
      302,
    );

  const days = Number.isInteger(savedState.days)
    ? Math.min(90, Math.max(1, savedState.days ?? 30))
    : 30;
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 2);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - days + 1);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);
  type SearchConsoleRow = {
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  };
  const querySearchConsole = async (
    dimensions: string[],
    rowLimit: number,
  ): Promise<SearchConsoleRow[]> => {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(searchConsoleProperty)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          dimensions,
          rowLimit,
        }),
      },
    );
    if (!response.ok) throw new Error("Search Console query failed");
    const data = (await response.json()) as { rows?: SearchConsoleRow[] };
    return data.rows ?? [];
  };
  let countryRows: SearchConsoleRow[] = [];
  let queryRows: SearchConsoleRow[] = [];
  try {
    [countryRows, queryRows] = await Promise.all([
      querySearchConsole(["country"], 25_000),
      querySearchConsole(["query"], 100),
    ]);
  } catch {
    return Response.redirect(
      `${adminPublicOrigin(request, env)}/admin/reports/?gsc=error`,
      302,
    );
  }

  const snapshotId = crypto.randomUUID();
  const fetchedAt = new Date().toISOString();
  const countryStatements = countryRows
    .map((row) => {
      const country = text(row.keys?.[0], 8).toLowerCase();
      if (!/^[a-z]{2,3}$/.test(country)) return null;
      return env.REPORTS.prepare(
        `INSERT INTO search_console_country_snapshots
         (snapshot_id, start_date, end_date, country, clicks, impressions, ctr, position, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        snapshotId,
        start,
        end,
        country,
        Number(row.clicks ?? 0),
        Number(row.impressions ?? 0),
        Number(row.ctr ?? 0),
        Number(row.position ?? 0),
        fetchedAt,
      );
    })
    .filter(
      (statement): statement is D1PreparedStatement => statement !== null,
    );
  const queryStatements = queryRows
    .map((row) => {
      const query = normalizedText(row.keys?.[0], 320);
      if (!query) return null;
      return env.REPORTS.prepare(
        `INSERT INTO search_console_query_snapshots
         (snapshot_id, start_date, end_date, query, clicks, impressions, ctr, position, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        snapshotId,
        start,
        end,
        query,
        Number(row.clicks ?? 0),
        Number(row.impressions ?? 0),
        Number(row.ctr ?? 0),
        Number(row.position ?? 0),
        fetchedAt,
      );
    })
    .filter(
      (statement): statement is D1PreparedStatement => statement !== null,
    );
  const statements = [...countryStatements, ...queryStatements];
  if (statements.length) await env.REPORTS.batch(statements);
  return Response.redirect(
    `${adminPublicOrigin(request, env)}/admin/reports/?gsc=imported`,
    302,
  );
}

async function listGoogleAccounts(
  request: Request,
  env: Env,
): Promise<Response> {
  const account = await getAuthenticatedAtlasezAccount(request, env);
  if (isResponse(account)) return account;
  const result = await env.REPORTS.prepare(
    `SELECT email,created_at,last_login_at
     FROM atlasez_google_identities
     WHERE account_id=?
     ORDER BY created_at ASC, email ASC`,
  )
    .bind(account.id)
    .all<{ email: string; created_at: string; last_login_at: string | null }>();
  return json({
    canonicalEmail: account.canonical_email,
    identities: result.results ?? [],
  });
}

async function startGoogleAccountLink(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  const account = await getAuthenticatedAtlasezAccount(request, env);
  if (isResponse(account)) return account;
  const requestUrl = new URL(request.url);
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: googleCallbackUrl(request, env),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  }).toString();
  const headers = new Headers({ location: authorization.toString() });
  headers.append(
    "set-cookie",
    cookie(
      GOOGLE_LINK_STATE_COOKIE,
      JSON.stringify({
        state,
        accountId: account.id,
        returnTo: adminReturnPath(requestUrl.searchParams.get("returnTo")),
      }),
      10 * 60,
      "/auth/google",
    ),
  );
  return new Response(null, { status: 302, headers });
}

const accountLinkResultUrl = (
  request: Request,
  returnTo: string | undefined,
  result: string,
) => {
  const target = new URL(adminReturnPath(returnTo ?? null), request.url);
  target.searchParams.set("accountLink", result);
  return target.toString();
};

async function completeGoogleAccountLink(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  let savedState: {
    state?: string;
    accountId?: string;
    returnTo?: string;
  } = {};
  try {
    savedState = JSON.parse(cookieValue(request, GOOGLE_LINK_STATE_COOKIE)) as typeof savedState;
  } catch {
    // 不正なCookieは連携失敗として扱う。
  }
  const fail = () =>
    Response.redirect(
      accountLinkResultUrl(request, savedState.returnTo, "error"),
      302,
    );
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const state = new URL(request.url).searchParams.get("state") ?? "";
  if (!code || !state || state !== savedState.state || !savedState.accountId)
    return fail();
  const currentAccount = await getAuthenticatedAtlasezAccount(request, env);
  if (isResponse(currentAccount) || currentAccount.id !== savedState.accountId)
    return fail();
  let token: { access_token?: string };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: googleCallbackUrl(request, env),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    token = (await tokenResponse.json()) as { access_token?: string };
  } catch {
    return fail();
  }
  if (!token.access_token) return fail();
  let user: {
    email?: string;
    email_verified?: boolean;
    sub?: string;
  };
  try {
    const userResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    if (!userResponse.ok) throw new Error("userinfo failed");
    user = (await userResponse.json()) as typeof user;
  } catch {
    return fail();
  }
  const email = user.email?.trim().toLowerCase() ?? "";
  const subject = user.sub?.trim() ?? "";
  if (!user.email_verified || !subject || !EMAIL_PATTERN.test(email))
    return fail();
  try {
    await resolveGoogleAccount(env, subject, email, savedState.accountId);
  } catch (error) {
    if (error instanceof GoogleIdentityConflictError) return fail();
    return fail();
  }
  return Response.redirect(
    accountLinkResultUrl(request, savedState.returnTo, "linked"),
    302,
  );
}

async function startGoogleLogin(request: Request, env: Env): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  const requestUrl = new URL(request.url);
  const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: googleCallbackUrl(request, env),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  }).toString();
  const headers = new Headers({ location: authorization.toString() });
  headers.append(
    "set-cookie",
    cookie(
      GOOGLE_STATE_COOKIE,
      JSON.stringify({
        state,
        returnTo: userReturnPath(requestUrl.searchParams.get("returnTo")),
      }),
      10 * 60,
      "/auth/google",
    ),
  );
  return new Response(null, { status: 302, headers });
}

async function completeGoogleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!googleOAuthEnabled(env) || !googleOAuthConfigured(env))
    return json({ error: "Googleログインはまだ有効ではありません。" }, 404);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code") ?? "";
  const state = requestUrl.searchParams.get("state") ?? "";
  let searchConsoleState: { state?: string } = {};
  try {
    searchConsoleState = JSON.parse(
      cookieValue(request, SEARCH_CONSOLE_STATE_COOKIE),
    ) as typeof searchConsoleState;
  } catch {
    // Search Console用Cookieがない通常ログインとして続行する。
  }
  if (code && state && state === searchConsoleState.state)
    return completeSearchConsoleImport(
      request,
      env,
      googleCallbackUrl(request, env),
    );
  let linkState: { state?: string } = {};
  try {
    linkState = JSON.parse(
      cookieValue(request, GOOGLE_LINK_STATE_COOKIE),
    ) as typeof linkState;
  } catch {
    // Googleアカウント連携用Cookieがない通常ログインとして続行する。
  }
  if (code && state && state === linkState.state)
    return completeGoogleAccountLink(request, env);
  let savedState: { state?: string; returnTo?: string } = {};
  try {
    savedState = JSON.parse(cookieValue(request, GOOGLE_STATE_COOKIE)) as {
      state?: string;
      returnTo?: string;
    };
  } catch {
    // 不正なCookieはログイン失敗として扱う。
  }
  if (!code || !state || state !== savedState.state)
    return json(
      { error: "Googleログインの確認に失敗しました。もう一度お試しください。" },
      400,
    );

  let token: { access_token?: string };
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: googleCallbackUrl(request, env),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    token = (await tokenResponse.json()) as { access_token?: string };
  } catch {
    return json({ error: "Googleログインを完了できませんでした。" }, 502);
  }
  if (!token.access_token)
    return json({ error: "Googleログインを完了できませんでした。" }, 502);

  let user: { email?: string; email_verified?: boolean; sub?: string };
  try {
    const userResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { authorization: `Bearer ${token.access_token}` } },
    );
    if (!userResponse.ok) throw new Error("userinfo failed");
    user = (await userResponse.json()) as typeof user;
  } catch {
    return json({ error: "Googleアカウントを確認できませんでした。" }, 502);
  }
  const email = user.email?.trim().toLowerCase() ?? "";
  const subject = user.sub?.trim() ?? "";
  if (!user.email_verified || !subject || !EMAIL_PATTERN.test(email))
    return json({ error: "確認済みのGoogleメールアドレスが必要です。" }, 403);

  let account: { id: string; canonical_email: string };
  try {
    account = await resolveGoogleAccount(env, subject, email);
  } catch (error) {
    if (error instanceof GoogleIdentityConflictError)
      return json({ error: error.message }, 409);
    return json({ error: "Atlasezアカウントを作成できませんでした。" }, 500);
  }

  const sessionToken = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_DURATION_MS);
  await env.REPORTS.prepare(
    "DELETE FROM admin_auth_sessions WHERE expires_at <= ?",
  )
    .bind(now.toISOString())
    .run();
  await env.REPORTS.prepare(
    "INSERT INTO admin_auth_sessions (session_hash, email, account_id, google_subject, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      await hash(sessionToken),
      email,
      account.id,
      subject,
      expiresAt.toISOString(),
      now.toISOString(),
    )
    .run();
  const requestedReturnTo = userReturnPath(savedState.returnTo ?? null);
  const requestedArea = userAreaForPath(
    new URL(requestedReturnTo, "https://admin.local").pathname,
  );
  const stage = await getUserStageForEmail(account.canonical_email, env);
  const location =
    requestedArea && canAccess(stage.stage, requestedArea)
      ? requestedReturnTo
      : stageHome(stage.stage, stage.projectSlug);
  const headers = new Headers({ location });
  headers.append(
    "set-cookie",
    cookie(
      ADMIN_SESSION_COOKIE,
      sessionToken,
      ADMIN_SESSION_DURATION_MS / 1_000,
    ),
  );
  headers.append(
    "set-cookie",
    cookie(GOOGLE_STATE_COOKIE, "", 0, "/auth/google"),
  );
  return new Response(null, { status: 302, headers });
}

async function logoutAdmin(request: Request, env: Env): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (token) {
    try {
      await env.REPORTS.prepare(
        "DELETE FROM admin_auth_sessions WHERE session_hash = ?",
      )
        .bind(await hash(token))
        .run();
    } catch {
      console.error(
        JSON.stringify({ event: "admin_logout_failed", category: "d1" }),
      );
      return json(
        { error: "ログアウトを完了できませんでした。もう一度お試しください。" },
        500,
      );
    }
  }
  const requestUrl = new URL(request.url);
  const headers = new Headers({
    location: cloudflareAccessEnabled(env)
      ? `${requestUrl.origin}/cdn-cgi/access/logout`
      : `${requestUrl.origin}/auth/logged-out`,
  });
  headers.append("set-cookie", cookie(ADMIN_SESSION_COOKIE, "", 0));
  headers.append(
    "set-cookie",
    cookie(GOOGLE_STATE_COOKIE, "", 0, "/auth/google"),
  );
  return new Response(null, { status: 303, headers });
}

async function logoutGoogleSession(
  request: Request,
  env: Env,
): Promise<Response> {
  if (!isSameOrigin(request))
    return json({ error: "この送信元からは受け付けられません。" }, 403);
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (token) {
    try {
      await env.REPORTS.prepare(
        "DELETE FROM admin_auth_sessions WHERE session_hash = ?",
      )
        .bind(await hash(token))
        .run();
    } catch {
      console.error(
        JSON.stringify({
          event: "admin_google_session_logout_failed",
          category: "d1",
        }),
      );
      return json(
        { error: "Googleセッションのログアウトを完了できませんでした。" },
        500,
      );
    }
  }
  const headers = new Headers({
    location: adminReturnPath(
      new URL(request.url).searchParams.get("returnTo"),
    ),
  });
  headers.append("set-cookie", cookie(ADMIN_SESSION_COOKIE, "", 0));
  headers.append(
    "set-cookie",
    cookie(GOOGLE_STATE_COOKIE, "", 0, "/auth/google"),
  );
  return new Response(null, { status: 303, headers });
}

const loggedOutPage = () =>
  new Response(
    '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ログアウトしました</title><main><h1>ログアウトしました</h1><p>再度利用する場合は、管理サイトへアクセスして認証してください。</p></main></html>',
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );

async function adminAuthStatus(request: Request, env: Env): Promise<Response> {
  const scope = await getMemberProfileScope(request, env);
  if (isResponse(scope)) return scope;
  const identity = scope.email;
  const managerProjects = scope.isManager
    ? await env.REPORTS.prepare(
        "SELECT id FROM atlasez_projects ORDER BY id",
      ).all<{ id: string }>()
    : await env.REPORTS.prepare(
        `SELECT project_id AS id FROM atlasez_project_memberships
         WHERE email=? AND role='manager' ORDER BY project_id`,
      )
        .bind(identity)
        .all<{ id: string }>();
  const token = cookieValue(request, ADMIN_SESSION_COOKIE);
  const googleSession = token
    ? await env.REPORTS.prepare(
        "SELECT email,account_id,google_subject FROM admin_auth_sessions WHERE session_hash = ? AND expires_at > ?",
      )
        .bind(await hash(token), new Date().toISOString())
        .first<{ email: string; account_id: string | null; google_subject: string | null }>()
    : null;
  return json({
    email: identity,
    isManager: scope.isManager,
    managerProjects: (managerProjects.results ?? []).map((row) => row.id),
    googlePreviewEnabled: googleOAuthEnabled(env) && googleOAuthConfigured(env),
    googleAuthenticated: Boolean(googleSession?.email),
    authMode: authMode(env),
  });
}

async function adminNotifications(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const profile = await env.REPORTS.prepare(
    "SELECT display_name FROM editorial_member_profiles WHERE email = ?",
  )
    .bind(scope.email)
    .first<{ display_name: string }>();
  const mentionNeedle = profile?.display_name?.trim()
    ? `@${profile.display_name.trim()}`
    : "";
  const canReviewApplications =
    scope.isManager ||
    (await operationProjectRole(env, scope, "secretariat")) === "manager";
  const [
    commentRows,
    mentionRows,
    approvedRows,
    publishedRows,
    reviewRows,
    applicationRows,
    taskReminderRows,
    taskRows,
  ] = await Promise.all([
    env.REPORTS.prepare(
      "SELECT c.id, c.body, c.parent_comment_id, c.created_at, d.id AS document_id, d.title FROM editorial_comments c JOIN editorial_documents d ON d.id = c.document_id WHERE d.created_by = ? AND c.created_by != ? ORDER BY c.created_at DESC LIMIT 12",
    )
      .bind(scope.email, scope.email)
      .all<{
        id: string;
        body: string;
        parent_comment_id: string | null;
        created_at: string;
        document_id: string;
        title: string;
      }>(),
    mentionNeedle
      ? env.REPORTS.prepare(
          "SELECT c.id, c.body, c.parent_comment_id, c.created_at, d.id AS document_id, d.title FROM editorial_comments c JOIN editorial_documents d ON d.id = c.document_id WHERE d.created_by != ? AND c.created_by != ? AND instr(c.body, ?) > 0 ORDER BY c.created_at DESC LIMIT 12",
        )
          .bind(scope.email, scope.email, mentionNeedle)
          .all<{
            id: string;
            body: string;
            parent_comment_id: string | null;
            created_at: string;
            document_id: string;
            title: string;
          }>()
      : Promise.resolve({
          results: [] as {
            id: string;
            body: string;
            parent_comment_id: string | null;
            created_at: string;
            document_id: string;
            title: string;
          }[],
        }),
    env.REPORTS.prepare(
      "SELECT id, title, updated_at FROM editorial_documents WHERE created_by = ? AND status = 'approved' AND published_at IS NULL ORDER BY updated_at DESC LIMIT 12",
    )
      .bind(scope.email)
      .all<{ id: string; title: string; updated_at: string }>(),
    env.REPORTS.prepare(
      "SELECT id, title, published_at FROM editorial_documents WHERE created_by = ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 12",
    )
      .bind(scope.email)
      .all<{ id: string; title: string; published_at: string }>(),
    scope.isManager
      ? env.REPORTS.prepare(
          "SELECT d.id, d.subject, d.title, d.updated_by, d.updated_at FROM editorial_documents d LEFT JOIN editorial_review_assignments r ON r.document_id = d.id WHERE d.status = 'in-review' AND r.task_id IS NULL ORDER BY d.updated_at ASC LIMIT 30",
        ).all<{
          id: string;
          subject: string;
          title: string;
          updated_by: string;
          updated_at: string;
        }>()
      : Promise.resolve({
          results: [] as {
            id: string;
            subject: string;
            title: string;
            updated_by: string;
            updated_at: string;
          }[],
        }),
    canReviewApplications
      ? env.REPORTS.prepare(
          `SELECT id,name,email,project_slug,created_at
             FROM atlasez_member_applications
            WHERE status='new'
            ORDER BY created_at DESC LIMIT 20`,
        ).all<{
          id: string;
          name: string;
          email: string;
          project_slug: string;
          created_at: string;
        }>()
      : Promise.resolve({
          results: [] as {
            id: string;
            name: string;
            email: string;
            project_slug: string;
            created_at: string;
          }[],
        }),
    env.REPORTS.prepare(
      `SELECT r.id AS reminder_id,r.remind_at,r.timezone,r.label,t.id,t.title,t.project_id,p.slug AS project_slug
         FROM editorial_task_reminders r JOIN editorial_tasks t ON t.id=r.task_id
         JOIN atlasez_projects p ON p.id=t.project_id
         WHERE t.status != 'done' AND (lower(t.created_by)=lower(?) OR lower(t.assignee_email)=lower(?) OR instr(',' || lower(COALESCE(t.assignee_email,'')) || ',', ',' || lower(?) || ',') > 0 OR (t.task_kind='feedback' AND t.assignee_email='*'))
           AND (NULLIF(TRIM(t.reminder_email),'') IS NULL OR lower(TRIM(t.reminder_email))=lower(?))
         ORDER BY r.remind_at ASC LIMIT 50`,
    )
      .bind(scope.email, scope.email, scope.email, scope.email)
      .all<{
        reminder_id: string;
        remind_at: string;
        timezone: string;
        label: string;
        id: string;
        title: string;
        project_id: string;
        project_slug: string;
      }>(),
    env.REPORTS.prepare(
      `SELECT t.id,t.title,t.task_kind,t.details,t.project_id,t.updated_at,
         COALESCE(p.slug,t.project_id) AS project_slug
       FROM editorial_tasks t
       LEFT JOIN atlasez_projects p ON p.id=t.project_id
       WHERE t.status != 'done' AND ${
         scope.isManager
           ? "1=1"
           : `(lower(t.created_by)=lower(?) OR lower(t.assignee_email)=lower(?) OR instr(',' || lower(COALESCE(t.assignee_email,'')) || ',', ',' || lower(?) || ',') > 0 OR (t.task_kind='feedback' AND t.assignee_email='*'))${
               scope.allSubjects
                 ? ""
                 : ` AND (t.subject IS NULL OR t.subject='*' OR t.subject IN (${scope.subjects.map(() => "?").join(",")}))`
             }`
       }
       ORDER BY t.updated_at DESC LIMIT 40`,
    )
      .bind(
        ...(scope.isManager
          ? []
          : [
              scope.email,
              scope.email,
              scope.email,
              ...(!scope.allSubjects ? scope.subjects : []),
            ]),
      )
      .all<{
        id: string;
        title: string;
        task_kind: string;
        details: string;
        project_id: string;
        project_slug: string;
        updated_at: string;
      }>(),
  ]);
  const [publicationReviewRows, publicationReturnedRows] = await Promise.all([
    env.REPORTS.prepare(
      `SELECT d.id, d.title, d.subject, d.publication_review_stage, d.updated_at
       FROM editorial_documents d
       WHERE d.published_at IS NULL AND (
         (d.publication_review_stage='subject-coordinator' AND EXISTS (
           SELECT 1 FROM editorial_workflow_roles r
           WHERE r.role='subject-coordinator' AND (r.subject=d.subject OR r.subject='*') AND lower(r.email)=lower(?)
         )) OR
         (d.publication_review_stage='project-leader' AND EXISTS (
           SELECT 1 FROM editorial_workflow_roles r
           WHERE r.role='project-leader' AND lower(r.email)=lower(?)
         ))
       )
       ORDER BY d.updated_at DESC LIMIT 20`,
    ).bind(scope.email, scope.email).all<{
      id: string; title: string; subject: string;
      publication_review_stage: EditorialPublicationReviewStage;
      updated_at: string;
    }>(),
    env.REPORTS.prepare(
      `SELECT d.id, d.title, r.stage, r.note, r.created_at
       FROM editorial_publication_reviews r
       JOIN editorial_documents d ON d.id=r.document_id
       WHERE r.decision='rejected' AND lower(d.created_by)=lower(?)
         AND r.created_at=(SELECT MAX(r2.created_at) FROM editorial_publication_reviews r2 WHERE r2.document_id=r.document_id)
       ORDER BY r.created_at DESC LIMIT 20`,
    ).bind(scope.email).all<{
      id: string; title: string; stage: EditorialPublicationReviewStage;
      note: string; created_at: string;
    }>(),
  ]);
  const notifications = [
    ...(commentRows.results ?? []).map((item) => ({
      id: `comment-${item.id}`,
      kind: "comment",
      title: `${item.parent_comment_id ? "コメントに返信" : "記事に新しいコメント"}：${item.title}`,
      detail: item.body.slice(0, 90),
      href: `/admin/editor/?document=${encodeURIComponent(item.document_id)}`,
      updatedAt: item.created_at,
    })),
    ...(mentionRows.results ?? []).map((item) => ({
      id: `mention-${item.id}`,
      kind: "mention",
      title: `メンションされました：${item.title}`,
      detail: item.body.slice(0, 90),
      href: `/admin/editor/?document=${encodeURIComponent(item.document_id)}`,
      updatedAt: item.created_at,
    })),
    ...(approvedRows.results ?? []).map((item) => ({
      id: `approved-${item.id}`,
      kind: "approved",
      title: `フィードバック完了：${item.title}`,
      detail: "公開前の原稿を確認してください。",
      href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
      updatedAt: item.updated_at,
    })),
    ...(publishedRows.results ?? []).map((item) => ({
      id: `published-${item.id}`,
      kind: "published",
      title: `記事が公開されました：${item.title}`,
      detail: "学習サイトへの反映を確認できます。",
      href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
      updatedAt: item.published_at,
    })),
    ...(publicationReviewRows.results ?? []).map((item) => ({
      id: `publication-review-${item.id}-${item.publication_review_stage}`,
      kind: "publication-review",
      title: `${item.publication_review_stage === "subject-coordinator" ? "公開審査（分野統括）" : "公開審査（プロジェクトリーダー）"}：${item.title}`,
      detail: `担当分野：${item.subject} ／ 審査をお願いします。`,
      href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
      updatedAt: item.updated_at,
    })),
    ...(publicationReturnedRows.results ?? []).map((item) => ({
      id: `publication-review-returned-${item.id}-${item.created_at}`,
      kind: "publication-review-returned",
      title: `公開審査から差し戻し：${item.title}`,
      detail: item.note || "フィードバック中へ戻されました。内容を確認してください。",
      href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
      updatedAt: item.created_at,
    })),
    ...(scope.isManager
      ? (reviewRows.results ?? []).map((item) => ({
          id: `review-${item.id}`,
          kind: "review",
          title: `フィードバック依頼：${item.title}`,
          detail: `担当分野：${item.subject} ／ 依頼者：${item.updated_by}`,
          href: `/admin/editor/?document=${encodeURIComponent(item.id)}`,
          updatedAt: item.updated_at,
        }))
      : []),
    ...(taskRows.results ?? []).map((item) => ({
      id: `${item.task_kind === "feedback" ? "feedback-request" : "task-request"}-${item.id}`,
      kind: item.task_kind === "feedback" ? "feedback-request" : "task-request",
      title: `${taskKindLabel(item.task_kind)}：${item.title}`,
      detail: item.details?.split("\n")[0] || "依頼内容を確認してください。",
      href: `/admin/operations/?project=${encodeURIComponent(item.project_slug)}`,
      updatedAt: item.updated_at,
    })),
    ...(applicationRows.results ?? []).map((item) => ({
      id: `application-${item.id}`,
      kind: "application",
      title: `新しい応募：${APPLICATION_FORM_LABELS[item.project_slug] ?? item.project_slug}`,
      detail: `${item.name}（${item.email}）の応募を確認してください。`,
      href: `/admin/applications/?project=${encodeURIComponent(item.project_slug)}`,
      updatedAt: item.created_at,
    })),
    ...(taskReminderRows.results ?? [])
      .filter(
        (item) => wallTimeToEpoch(item.remind_at, item.timezone) <= Date.now(),
      )
      .map((item) => ({
        id: `task-reminder-rule-${item.reminder_id}-${item.remind_at}`,
        kind: "task-reminder",
        title: `ToDoリマインダー：${item.title}`,
        detail: item.label || "設定した日時",
        href: `/admin/operations/?project=${encodeURIComponent(item.project_slug)}`,
        updatedAt: item.remind_at,
      })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
  const readIds = notifications.length
    ? await env.REPORTS.prepare(
        `SELECT notification_id FROM admin_notification_reads WHERE email = ? AND notification_id IN (${notifications.map(() => "?").join(",")})`,
      )
        .bind(scope.email, ...notifications.map((item) => item.id))
        .all<{ notification_id: string }>()
    : { results: [] as { notification_id: string }[] };
  const read = new Set(
    (readIds.results ?? []).map((item) => item.notification_id),
  );
  return json({
    notifications: notifications.map((item) => ({
      ...item,
      read: read.has(item.id),
    })),
  });
}

async function markAdminNotificationsRead(
  request: Request,
  env: Env,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  if (!isSameOrigin(request))
    return json({ error: "許可されていない送信元です。" }, 403);
  const payload = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  const ids = Array.isArray(payload?.ids)
    ? [
        ...new Set(
          payload!.ids
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                /^(comment|mention|approved|published|review|publication-review|publication-review-returned|application|feedback-request|task-request|task-reminder|task-reminder-rule)-[a-zA-Z0-9:._+\-]{8,}$/.test(
                  id,
                ),
            )
            .slice(0, 32),
        ),
      ]
    : [];
  if (!ids.length)
    return json({ error: "既読にする通知を選択してください。" }, 400);
  const now = new Date().toISOString();
  await env.REPORTS.batch(
    ids.map((id) =>
      env.REPORTS.prepare(
        "INSERT INTO admin_notification_reads (email, notification_id, read_at) VALUES (?, ?, ?) ON CONFLICT(email, notification_id) DO UPDATE SET read_at = excluded.read_at",
      ).bind(scope.email, id, now),
    ),
  );
  return json({ ok: true });
}

async function connectEditorialCollaboration(
  request: Request,
  env: Env,
  documentId: string,
  localNamespace?: DurableObjectNamespace,
): Promise<Response> {
  const scope = await getAdminScope(request, env);
  if (isResponse(scope)) return scope;
  const namespace =
    env.EDITORIAL_COLLABORATION ??
    (env.ADMIN_AUTH_MODE === "local" ? localNamespace : undefined);
  if (!namespace)
    return json({ error: "同時編集サービスが設定されていません。" }, 503);
  const document = await env.REPORTS.prepare(
    "SELECT subject FROM editorial_documents WHERE id = ?",
  )
    .bind(documentId)
    .first<{ subject: string }>();
  if (!document) return json({ error: "原稿が見つかりません。" }, 404);
  if (!canEditSubject(scope, document.subject))
    return json({ error: "この原稿を同時編集する権限がありません。" }, 403);
  const profile = await env.REPORTS.prepare(
    "SELECT display_name FROM editorial_member_profiles WHERE lower(email) = lower(?)",
  )
    .bind(scope.email)
    .first<{ display_name: string }>()
    .catch(() => null);
  const headers = new Headers(request.headers);
  headers.set("x-atlasez-document-id", documentId);
  headers.set("x-atlasez-user-email", scope.email);
  headers.set(
    "x-atlasez-user-name",
    encodeURIComponent(
      profile?.display_name?.trim() || scope.email.split("@")[0],
    ),
  );
  const id = namespace.idFromName(documentId);
  return namespace.get(id).fetch(new Request(request, { headers }));
}

type EditorialActiveEditor = {
  sessionId: string;
  email: string;
  displayName: string;
  field: string;
};

const listEditorialActiveEditors = async (
  env: Env,
  documentIds: string[],
): Promise<Map<string, EditorialActiveEditor[]>> => {
  const namespace = env.EDITORIAL_COLLABORATION;
  if (!namespace || !documentIds.length) return new Map();
  const entries = await Promise.all(
    documentIds.map(async (documentId) => {
      try {
        const response = await namespace
          .get(namespace.idFromName(documentId))
          .fetch(
            new Request("https://atlasez-editorial-collaboration.internal/presence", {
              method: "GET",
              headers: { "x-atlasez-document-id": documentId },
            }),
          );
        if (!response.ok)
          return [documentId, [] as EditorialActiveEditor[]] as const;
        const payload = (await response.json()) as {
          participants?: EditorialActiveEditor[];
        };
        const participants = Array.isArray(payload.participants)
          ? payload.participants.filter(
              (participant): participant is EditorialActiveEditor =>
                Boolean(
                  participant &&
                    typeof participant.sessionId === "string" &&
                    typeof participant.email === "string" &&
                    typeof participant.displayName === "string" &&
                    typeof participant.field === "string",
                ),
            )
          : [];
        return [documentId, participants] as const;
      } catch {
        // 同時編集サービスが一時的に利用できなくても、原稿一覧は表示する。
        return [documentId, [] as EditorialActiveEditor[]] as const;
      }
    }),
  );
  return new Map(entries);
};

async function notifyEditorialCommentChange(
  env: Env,
  documentId: string,
): Promise<void> {
  const namespace = env.EDITORIAL_COLLABORATION;
  if (!namespace) return;
  try {
    const id = namespace.idFromName(documentId);
    await namespace.get(id).fetch(
      new Request("https://atlasez-editorial-collaboration.internal/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-atlasez-document-id": documentId,
        },
        body: JSON.stringify({ type: "comments-changed" }),
      }),
    );
  } catch {
    // コメント自体の保存を失敗させず、接続中の画面は再読込で回復できるようにする。
  }
}

async function handleAdminRequest(
  request: Request,
  env: Env,
  ctx?: WorkerExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/internal/article-reports")
    return ingestArticleReport(request, env);
  if (url.pathname === "/") {
    const current = await getCurrentUserStage(request, env);
    if (isResponse(current)) {
      if (current.status === 401)
        return Response.redirect(`${url.origin}/applicant/`, 302);
      return current;
    }
    return Response.redirect(
      `${url.origin}${stageHome(current.stage, current.projectSlug)}`,
      302,
    );
  }
  if (url.pathname === "/auth/google/login" && request.method === "GET")
    return startGoogleLogin(request, env);
  if (url.pathname === "/auth/google/link" && request.method === "GET")
    return startGoogleAccountLink(request, env);
  if (url.pathname === "/auth/google/callback" && request.method === "GET")
    return completeGoogleLogin(request, env);
  if (url.pathname === "/auth/discord/start" && request.method === "GET")
    return startDiscordOAuth(request, env);
  if (url.pathname === "/auth/discord/callback" && request.method === "GET")
    return completeDiscordOAuth(request, env, ctx);
  if (
    url.pathname === "/auth/google/search-console" &&
    request.method === "GET"
  )
    return startSearchConsoleImport(request, env);
  if (
    url.pathname === "/auth/google/search-console/callback" &&
    request.method === "GET"
  )
    return completeSearchConsoleImport(request, env);
  if (url.pathname === "/auth/logout")
    return request.method === "POST"
      ? logoutAdmin(request, env)
      : json({ error: "POSTのみ利用できます。" }, 405);
  if (url.pathname === "/auth/google/logout")
    return request.method === "POST"
      ? logoutGoogleSession(request, env)
      : json({ error: "POSTのみ利用できます。" }, 405);
  if (url.pathname === "/auth/logged-out" && request.method === "GET")
    return loggedOutPage();
  if (
    url.pathname === "/api/public/application-config" &&
    request.method === "GET"
  )
    return publicApplicationConfig(env);
  if (url.pathname === "/api/user/status" && request.method === "GET")
    return userStatus(request, env);
  if (url.pathname === "/api/application-profile") {
    if (request.method === "GET") return getApplicationProfile(request, env);
    if (request.method === "POST") return saveApplicationProfile(request, env);
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  }
  if (url.pathname === "/api/applicant/me" && request.method === "GET")
    return applicantSummary(request, env);
  if (url.pathname === "/api/onboarding/me") {
    if (request.method === "GET") return getOnboarding(request, env);
    if (request.method === "POST") return completeOnboarding(request, env);
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  }
  if (url.pathname === "/api/onboarding/project") {
    if (request.method === "GET") return getOnboardingProject(request, env);
    if (request.method === "POST")
      return completeOnboardingProject(request, env);
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  }
  if (url.pathname === "/api/onboarding/tutorial") {
    if (request.method === "GET") return getOnboardingTutorial(request, env);
    if (request.method === "POST")
      return advanceOnboardingTutorial(request, env);
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  }
  // 応募フォームから遷移する個人情報保護方針は、認証不要の静的ページとして公開する。
  if (url.pathname === "/privacy-policy" || url.pathname === "/privacy-policy/")
    return fetchAdminAsset(request, env);
  if (
    url.pathname === "/api/onboarding/atlas-writing-practice" &&
    request.method === "POST"
  )
    return completeAtlasWritingPractice(request, env);
  if (url.pathname === "/api/apply" && request.method === "POST")
    return submitMemberApplication(request, env, "same-origin", ctx);
  if (url.pathname === "/api/public/applications") {
    if (request.method !== "POST")
      return json({ error: "POSTのみ利用できます。" }, 405);
    return submitMemberApplication(request, env, "public-worker", ctx);
  }
  if (url.pathname === "/api/admin/auth-status" && request.method === "GET")
    return adminAuthStatus(request, env);
  if (url.pathname === "/api/admin/notifications" && request.method === "GET")
    return adminNotifications(request, env);
  if (
    url.pathname === "/api/admin/notifications/read" &&
    request.method === "POST"
  )
    return markAdminNotificationsRead(request, env);
  if (url.pathname === "/api/admin/report-admin-permissions") {
    if (request.method === "GET")
      return listReportAdminPermissions(request, env);
    if (request.method === "POST")
      return createReportAdminPermission(request, env);
    if (request.method === "DELETE")
      return deleteReportAdminPermission(request, env);
    return json({ error: "GET、POST、DELETEのみ利用できます。" }, 405);
  }
  if (url.pathname === "/api/admin/editorial-workflow-roles") {
    if (request.method === "POST") return createEditorialWorkflowRole(request, env);
    if (request.method === "DELETE") return deleteEditorialWorkflowRole(request, env);
    return json({ error: "POST、DELETEのみ利用できます。" }, 405);
  }
  if (
    url.pathname === "/api/admin/discord-member-roles" &&
    request.method === "POST"
  ) {
    try {
      return await syncDiscordMemberRoles(request, env);
    } catch (error) {
      return json(
        {
          error: `Discord情報確認中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        },
        500,
      );
    }
  }
  if (
    url.pathname === "/api/admin/member-discord-user" &&
    request.method === "PUT"
  )
    return updateMemberDiscordUserId(request, env);
  if (
    url.pathname === "/api/admin/discord-provision-roles" &&
    request.method === "POST"
  ) {
    try {
      return await provisionDiscordAttributeRoles(request, env);
    } catch (error) {
      return json(
        {
          error: `ロール準備中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
        },
        500,
      );
    }
  }
  if (
    url.pathname === "/api/admin/member-attributes" &&
    request.method === "PUT"
  )
    return updateMemberAttributes(request, env);
  if (url.pathname === "/api/admin/article-reports") {
    return request.method === "GET"
      ? listArticleReports(request, env)
      : json({ error: "GETのみ利用できます。" }, 405);
  }
  if (
    url.pathname === "/api/admin/article-analytics" &&
    request.method === "GET"
  )
    return listArticleAnalytics(request, env);
  if (
    url.pathname === "/api/admin/article-analytics-regions" &&
    request.method === "GET"
  )
    return listArticleAnalyticsRegions(request, env);
  if (
    url.pathname === "/api/admin/search-console-country-analytics" &&
    request.method === "GET"
  )
    return listSearchConsoleCountryStats(request, env);
  if (
    url.pathname === "/api/admin/search-console-query-analytics" &&
    request.method === "GET"
  )
    return listSearchConsoleQueryStats(request, env);
  if (url.pathname === "/api/admin/personal-workspace") {
    if (request.method === "GET") return getPersonalWorkspace(request, env);
    if (request.method === "PUT") return savePersonalWorkspace(request, env);
    return json({ error: "GET、PUTのみ利用できます。" }, 405);
  }
  if (url.pathname === "/api/admin/profile") {
    if (request.method === "GET") return getMyProfile(request, env);
    if (request.method === "PUT") return saveMyProfile(request, env);
    return json({ error: "GET、PUTのみ利用できます。" }, 405);
  }
  if (url.pathname === "/api/admin/google-accounts" && request.method === "GET")
    return listGoogleAccounts(request, env);
  if (url.pathname === "/api/admin/project-profile") {
    if (request.method === "GET") return getProjectMemberProfile(request, env);
    if (request.method === "PUT") return saveProjectMemberProfile(request, env);
    return json({ error: "GET、PUTのみ利用できます。" }, 405);
  }
  if (
    url.pathname === "/api/admin/project-introductions" &&
    request.method === "GET"
  )
    return listProjectIntroductions(request, env);
  if (
    url.pathname === "/api/admin/project-profile-change-requests" &&
    request.method === "GET"
  )
    return listProjectProfileChangeRequests(request, env);
  const projectProfileChangeRequestMatch = url.pathname.match(
    /^\/api\/admin\/project-profile-change-requests\/([0-9a-f-]{36})$/i,
  );
  if (projectProfileChangeRequestMatch && request.method === "PATCH")
    return reviewProjectProfileChangeRequest(
      request,
      env,
      projectProfileChangeRequestMatch[1],
    );
  if (
    url.pathname === "/api/admin/profile-change-requests" &&
    request.method === "GET"
  )
    return listProfileChangeRequests(request, env);
  const profileChangeRequestMatch = url.pathname.match(
    /^\/api\/admin\/profile-change-requests\/([0-9a-f-]{36})$/i,
  );
  if (profileChangeRequestMatch && request.method === "PATCH")
    return reviewProfileChangeRequest(
      request,
      env,
      profileChangeRequestMatch[1],
    );
  if (url.pathname === "/api/admin/portal" && request.method === "GET")
    return portalOverview(request, env);
  if (url.pathname === "/api/admin/member-tasks" && request.method === "GET")
    return memberTasksOverview(request, env);
  if (url.pathname === "/api/admin/member-calendar" && request.method === "GET")
    return memberCalendarOverview(request, env);
  if (url.pathname === "/api/admin/projects" && request.method === "POST")
    return createAtlasezProject(request, env);
  if (url.pathname === "/api/admin/applications" && request.method === "GET")
    return listApplications(request, env);
  const applicationMatch = url.pathname.match(
    /^\/api\/admin\/applications\/([0-9a-f-]{36})$/i,
  );
  if (applicationMatch && request.method === "PATCH")
    return updateApplication(request, env, applicationMatch[1], ctx);
  const applicationDiscordRetryMatch = url.pathname.match(
    /^\/api\/admin\/applications\/([0-9a-f-]{36})\/discord-retry$/i,
  );
  if (applicationDiscordRetryMatch && request.method === "POST")
    return retryApplicationDiscordProvisioning(
      request,
      env,
      applicationDiscordRetryMatch[1],
    );
  if (url.pathname === "/api/admin/operations" && request.method === "GET")
    return operationsOverview(request, env);
  if (url.pathname === "/api/admin/progress" && request.method === "GET")
    return progressReportsOverview(request, env);
  if (
    url.pathname === "/api/admin/operations/tasks" &&
    request.method === "POST"
  )
    return createOperation(request, env, "task");
  if (
    url.pathname === "/api/admin/operations/progress" &&
    request.method === "POST"
  )
    return createOperation(request, env, "progress");
  if (
    url.pathname === "/api/admin/operations/events" &&
    request.method === "POST"
  )
    return createOperation(request, env, "event");
  if (
    url.pathname === "/api/admin/operations/availability-blocks" &&
    request.method === "POST"
  )
    return createAvailabilityBlock(request, env);
  const availabilityBlockMatch = url.pathname.match(
    /^\/api\/admin\/operations\/availability-blocks\/([0-9a-f-]{36})$/i,
  );
  if (availabilityBlockMatch && request.method === "DELETE")
    return deleteAvailabilityBlock(request, env, availabilityBlockMatch[1]);
  const taskMatch = url.pathname.match(
    /^\/api\/admin\/operations\/tasks\/([0-9a-f-]{36})$/i,
  );
  if (taskMatch && request.method === "PATCH")
    return updateTask(request, env, taskMatch[1]);
  const availabilityMatch = url.pathname.match(
    /^\/api\/admin\/operations\/events\/([0-9a-f-]{36})\/availability$/i,
  );
  if (availabilityMatch && request.method === "PUT")
    return updateEventAvailability(request, env, availabilityMatch[1]);
  const eventMatch = url.pathname.match(
    /^\/api\/admin\/operations\/events\/([0-9a-f-]{36})$/i,
  );
  if (eventMatch && request.method === "DELETE")
    return deleteEvent(request, env, eventMatch[1]);
  if (
    url.pathname === "/api/admin/editor/sync-publication-status" &&
    request.method === "POST"
  )
    return syncEditorialPublicationStatusForAdmin(request, env);
  if (url.pathname === "/api/admin/editor/documents") {
    if (request.method === "GET") return listEditorialDocuments(request, env);
    if (request.method === "POST") return createEditorialDocument(request, env);
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  }
  const editorialArchiveMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/(archive|unarchive)$/i,
  );
  if (editorialArchiveMatch && request.method === "POST")
    return updateEditorialDocumentArchive(
      request,
      env,
      editorialArchiveMatch[1],
      editorialArchiveMatch[2].toLowerCase() === "archive",
    );
  if (url.pathname === "/api/admin/editor/board" && request.method === "GET")
    return editorialBoard(request, env);
  if (
    url.pathname === "/api/admin/editor/tikz/packages" &&
    request.method === "GET"
  )
    return tikzRendererPackages(request, env);
  if (
    url.pathname === "/api/admin/editor/tikz/render" &&
    request.method === "POST"
  )
    return renderEditorialTikz(request, env);
  const editorialCollaborationMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/collaboration$/i,
  );
  if (editorialCollaborationMatch)
    return request.headers.get("upgrade")?.toLowerCase() === "websocket"
      ? connectEditorialCollaboration(
          request,
          env,
          editorialCollaborationMatch[1],
          ctx?.exports?.EditorialCollaborationRoom,
        )
      : json({ error: "WebSocket接続が必要です。" }, 426);
  const editorialAssetCollectionMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/assets$/i,
  );
  if (editorialAssetCollectionMatch) {
    if (request.method === "GET")
      return listEditorialAssets(
        request,
        env,
        editorialAssetCollectionMatch[1],
      );
    if (request.method === "POST")
      return uploadEditorialAsset(
        request,
        env,
        editorialAssetCollectionMatch[1],
      );
    return json({ error: "GET、POSTのみ利用できます。" }, 405);
  }
  const editorialAssetMatch = url.pathname.match(
    /^\/api\/admin\/editor\/assets\/([0-9a-f-]{36})$/i,
  );
  if (editorialAssetMatch && request.method === "GET")
    return serveEditorialAsset(request, env, editorialAssetMatch[1]);
  if (editorialAssetMatch && request.method === "DELETE")
    return deleteEditorialAsset(request, env, editorialAssetMatch[1]);
  if (
    url.pathname === "/api/admin/editor/review-requests" &&
    request.method === "GET"
  )
    return listEditorialReviewRequests(request, env);
  const editorialReviewAssignmentMatch = url.pathname.match(
    /^\/api\/admin\/editor\/review-requests\/([0-9a-f-]{36})$/i,
  );
  if (editorialReviewAssignmentMatch && request.method === "PATCH")
    return updateEditorialReviewAssignment(
      request,
      env,
      editorialReviewAssignmentMatch[1],
    );
  const editorialRevisionMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/revisions$/i,
  );
  if (editorialRevisionMatch && request.method === "GET")
    return listEditorialRevisions(request, env, editorialRevisionMatch[1]);
  const editorialCommentMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/comments$/i,
  );
  if (editorialCommentMatch)
    return request.method === "POST"
      ? createEditorialComment(request, env, editorialCommentMatch[1])
      : json({ error: "POSTのみ利用できます。" }, 405);
  const editorialCommentStatusMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/comments\/([0-9a-f-]{36})$/i,
  );
  if (editorialCommentStatusMatch)
    return request.method === "PATCH"
      ? (await request
          .clone()
          .json()
          .then((payload) => payload?.action === "edit")
          .catch(() => false))
        ? editEditorialComment(
            request,
            env,
            editorialCommentStatusMatch[1],
            editorialCommentStatusMatch[2],
          )
        : updateEditorialCommentStatus(
            request,
            env,
            editorialCommentStatusMatch[1],
            editorialCommentStatusMatch[2],
          )
      : request.method === "DELETE"
        ? deleteEditorialComment(
            request,
            env,
            editorialCommentStatusMatch[1],
            editorialCommentStatusMatch[2],
          )
        : json({ error: "PATCH、DELETEのみ利用できます。" }, 405);
  const editorialPublicationReviewMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/publication-review$/i,
  );
  if (editorialPublicationReviewMatch) {
    if (request.method === "GET")
      return getPublicationReviewState(request, env, editorialPublicationReviewMatch[1]);
    if (request.method === "POST")
      return startPublicationReview(request, env, editorialPublicationReviewMatch[1]);
    if (request.method === "PATCH")
      return decidePublicationReview(request, env, editorialPublicationReviewMatch[1]);
    return json({ error: "GET、POST、PATCHのみ利用できます。" }, 405);
  }
  const editorialScheduleMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/schedule$/i,
  );
  if (editorialScheduleMatch)
    return request.method === "POST"
      ? scheduleEditorialPublication(request, env, editorialScheduleMatch[1])
      : json({ error: "POSTのみ利用できます。" }, 405);
  const editorialPublishMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/publish$/i,
  );
  if (editorialPublishMatch)
    return request.method === "POST"
      ? publishEditorialDocument(request, env, editorialPublishMatch[1])
      : json({ error: "POSTのみ利用できます。" }, 405);
  const editorialUnpublishMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})\/unpublish$/i,
  );
  if (editorialUnpublishMatch)
    return request.method === "POST"
      ? unpublishEditorialDocument(request, env, editorialUnpublishMatch[1])
      : json({ error: "POSTのみ利用できます。" }, 405);
  const editorialDocumentMatch = url.pathname.match(
    /^\/api\/admin\/editor\/documents\/([0-9a-f-]{36})$/i,
  );
  if (editorialDocumentMatch) {
    if (request.method === "GET")
      return getEditorialDocument(request, env, editorialDocumentMatch[1]);
    if (request.method === "PATCH")
      return updateEditorialDocument(request, env, editorialDocumentMatch[1]);
    return json({ error: "GET、PATCHのみ利用できます。" }, 405);
  }
  const match = url.pathname.match(
    /^\/api\/admin\/article-reports\/([0-9a-f-]{36})$/i,
  );
  if (match)
    return request.method === "PATCH"
      ? updateArticleReport(request, env, match[1])
      : json({ error: "PATCHのみ利用できます。" }, 405);
  const userArea =
    userAreaForPath(url.pathname) ??
    (url.pathname.startsWith("/applicant/")
      ? "applicant"
      : url.pathname.startsWith("/onboarding/")
        ? "onboarding"
        : null);
  if (userArea) {
    const current = await authorizeUserPage(request, env, userArea);
    if (isResponse(current)) return current;
    const managerPages = new Set([
      "/admin/permissions",
      "/admin/permissions/",
      "/admin/applications",
      "/admin/applications/",
      "/admin/onboarding-demo",
      "/admin/onboarding-demo/",
    ]);
    if (managerPages.has(url.pathname)) {
      const managerScope =
        url.pathname === "/admin/applications" ||
        url.pathname === "/admin/applications/"
          ? url.searchParams.has("project")
            ? await getProjectReviewerScope(
                request,
                env,
                url.searchParams.get("project") ?? "",
              )
            : await getGlobalAdminScope(request, env)
          : await getGlobalAdminScope(request, env);
      if (isResponse(managerScope)) return managerScope;
    }
    return fetchAdminAsset(request, env);
  }
  // Permit only the static support files used by the admin UI.  All learning
  // site pages remain unreachable from this Worker.
  if (
    url.pathname.startsWith("/_astro/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/data/") ||
    url.pathname === "/build-info.json" ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/admin-codemirror.js"
  ) {
    return env.ASSETS.fetch(request);
  }
  return new Response("Not found", { status: 404 });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx?: WorkerExecutionContext,
  ): Promise<Response> {
    try {
      return await handleAdminRequest(request, env, ctx);
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error("admin worker request failed", {
        requestId,
        method: request.method,
        pathname: new URL(request.url).pathname,
        error,
      });
      if (new URL(request.url).pathname.startsWith("/api/"))
        return json(
          {
            error:
              "データを読み込めませんでした。時間をおいて再読み込みしてください。改善しない場合は運営管理者へ連絡してください。",
            requestId,
          },
          500,
        );
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  async scheduled(
    controller: unknown,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const cron =
      typeof controller === "object" &&
      controller !== null &&
      "cron" in controller
        ? String((controller as { cron?: unknown }).cron ?? "")
        : "";
    if (cron === "*/5 * * * *") {
      ctx.waitUntil(
        Promise.all([
          dispatchDueTaskReminders(env),
          dispatchApplicationEmails(env),
          dispatchPendingDiscordProvisioning(env),
          dispatchScheduledEditorialPublications(env),
        ]),
      );
      return;
    }
    ctx.waitUntil(
      Promise.all([
        syncPublishedArticleBackups(env),
        syncEditorialPublicationStatus(env),
        purgeExpiredPersonalData(env),
        dispatchDueTaskReminders(env),
        dispatchApplicationEmails(env),
        dispatchPendingDiscordProvisioning(env),
        dispatchScheduledEditorialPublications(env),
      ]),
    );
  },
};

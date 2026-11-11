import {
  phaseLabels,
  recruitmentLabels,
  seminarNumber,
} from "../../lib/seminar-fields";
import {
  api,
  bindForm,
  detailLink,
  empty,
  html,
  loginUrl,
  numberFromUrl,
  post,
  publicDetails,
  urlFor,
  type CatalogItem,
} from "./shared";

async function loadCatalog() {
  const { seminars } = await api<{ seminars: CatalogItem[] }>();
  return seminars;
}

const normalize = (value: string) =>
  value.normalize("NFKC").toLowerCase().trim();

export async function renderCatalog(content: HTMLElement) {
  const seminars = await loadCatalog();
  const query = document.querySelector<HTMLInputElement>("[data-query]");
  const filter =
    document.querySelector<HTMLSelectElement>("[data-recruitment]");
  const count = document.querySelector<HTMLElement>("[data-count]");
  const indexed = seminars.map((item) => ({
    item,
    search: normalize(
      [
        item.title,
        seminarNumber(item.number),
        ...Object.values(item.details),
      ].join(" "),
    ),
  }));
  function render() {
    const terms = normalize(query?.value ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const matches = indexed.filter(
      ({ item, search }) =>
        (!filter?.value || item.recruitment === filter.value) &&
        terms.every((term) => search.includes(term)),
    );
    if (count) count.textContent = `${matches.length}件`;
    content.innerHTML = matches.length
      ? `<ul class="seminar-grid">${matches
          .map(
            ({ item }) => `
          <li class="seminar-card">
            <div class="seminar-row"><span class="seminar-tag ${item.recruitment}">${recruitmentLabels[item.recruitment]}</span><span class="seminar-number">No. ${seminarNumber(item.number)}</span></div>
            <h3><a href="${urlFor("detail", item.number)}">${html(item.title)}</a></h3>
            <p>${html([item.details.theme, item.details.format].filter(Boolean).join(" ・ "))}</p>
          </li>`,
          )
          .join("")}</ul>`
      : empty("検索条件に一致するゼミはありません。");
  }
  query?.addEventListener("input", render);
  filter?.addEventListener("change", render);
  render();
}

export async function renderDetail(content: HTMLElement) {
  const number = numberFromUrl();
  if (!number) throw new Error("ゼミ番号が指定されていません。");
  const item = await api<CatalogItem>(`/${number}`);
  document.title = `${item.title} | ゼミプラットフォーム`;
  const source = item.sourceUrl?.startsWith(
    "https://sites.google.com/view/atlasez-semi/",
  )
    ? item.sourceUrl
    : "";
  content.innerHTML = `
    <header class="seminar-page-head">
      <p class="seminar-eyebrow">No. ${seminarNumber(item.number)}</p>
      <h1>${html(item.title)}</h1>
      <div class="seminar-actions"><span class="seminar-tag ${item.recruitment}">${recruitmentLabels[item.recruitment]}</span><span>${phaseLabels[item.phase]}</span></div>
      ${
        item.acceptingApplications
          ? `<div class="seminar-actions"><a class="seminar-button" href="${urlFor("join", item.number)}">このゼミに参加申請する</a></div>`
          : `<p>${item.recruitment === "open" && source ? "このゼミは主催者のアカウント設定後に参加申請できます。" : "現在、参加申請の受付は終了または停止しています。"}</p>`
      }
    </header>
    <section class="seminar-panel" aria-label="ゼミの詳細">
      ${publicDetails(item)}
      ${source ? `<p><a href="${html(source)}">旧サイト掲載情報を見る</a></p>` : ""}
    </section>`;
}

export async function initApplicationForm(
  page: "propose" | "join",
  session: { signedIn: boolean; email?: string },
) {
  const auth = document.querySelector<HTMLElement>("[data-form-auth]");
  const form = document.querySelector<HTMLFormElement>(
    "[data-application-form]",
  );
  const success = document.querySelector<HTMLElement>("[data-form-success]");
  const email = document.querySelector<HTMLElement>("[data-form-email]");
  if (!auth || !form || !success || !email) return;
  if (!session.signedIn) {
    auth.innerHTML = `<p>フォームを送信するにはGoogleでログインしてください。申請後は参加者ページで状況を確認できます。</p><a class="seminar-button" href="${html(loginUrl())}">Googleでログイン</a>`;
    return;
  }
  if (page === "join") {
    const number = numberFromUrl();
    const seminars = await loadCatalog();
    const select = form.querySelector<HTMLSelectElement>(
      "[data-seminar-options]",
    );
    if (!select) return;
    for (const item of seminars.filter((item) => item.acceptingApplications)) {
      const option = new Option(
        `No. ${seminarNumber(item.number)} ${item.title}`,
        String(item.number),
      );
      select.add(option);
    }
    if (select.options.length <= 1) {
      auth.innerHTML =
        '<p>現在、参加申請を受け付けているゼミはありません。</p><a href="/seminars/#catalog">ゼミ一覧に戻る</a>';
      return;
    }
    if (number) {
      select.value = String(number);
      if (!select.value) {
        select.selectedIndex = 0;
        const item = seminars.find((seminar) => seminar.number === number);
        auth.innerHTML = `<p>${item ? detailLink(item) : "指定されたゼミ"}への申請は現在受け付けていません。</p>`;
      } else auth.hidden = true;
    } else auth.hidden = true;
  } else auth.hidden = true;
  email.textContent = session.email ?? "";
  form.hidden = false;
  const submissionKey = crypto.randomUUID();
  bindForm(form, async (data) => {
    const fields = Object.fromEntries(data);
    await post(
      page === "propose" ? "/proposals" : `/${Number(fields.number)}/join`,
      { ...fields, submissionKey },
    );
    auth.hidden = true;
    form.hidden = true;
    success.hidden = false;
    const heading = success.querySelector("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  });
}

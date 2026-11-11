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
      ? `<ul class="seminar-results">${matches
          .map(
            ({ item }) => `
          <li class="seminar-entry">
            <div class="seminar-row">
              <h3><a href="${urlFor("detail", item.number)}">${html(item.title)}</a></h3>
              <span class="seminar-state">${recruitmentLabels[item.recruitment]}</span>
            </div>
            <p class="seminar-meta"><span class="seminar-number">番号 ${seminarNumber(item.number)}</span>${html(
              [
                item.details.theme === item.title ? "" : item.details.theme,
                item.details.format,
              ]
                .filter(Boolean)
                .map((value) => ` ・ ${value}`)
                .join(""),
            )}</p>
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
      <h1>${html(item.title)}</h1>
      <p class="seminar-meta">ゼミ番号 ${seminarNumber(item.number)} ・ ${recruitmentLabels[item.recruitment]} ・ ${phaseLabels[item.phase]}</p>
      ${
        item.acceptingApplications
          ? `<div class="seminar-actions"><a class="button" href="${urlFor("join", item.number)}">このゼミに参加申請する</a></div>`
          : `<p>${item.recruitment === "open" && source ? "主催者の登録後に参加申請を受け付けます。" : "参加申請は受け付けていません。"}</p>`
      }
    </header>
    <section class="seminar-block" aria-labelledby="detail-heading">
      <h2 id="detail-heading">ゼミの詳細</h2>
      ${publicDetails(item)}
      ${source ? `<div class="seminar-actions"><a href="${html(source)}">旧サイトの掲載情報</a></div>` : ""}
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
    auth.innerHTML = `<p>申請にはGoogleアカウントが必要です。</p><a class="button" href="${html(loginUrl())}">Googleでログイン</a>`;
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
        `番号 ${seminarNumber(item.number)} ${item.title}`,
        String(item.number),
      );
      select.add(option);
    }
    if (select.options.length <= 1) {
      auth.innerHTML =
        '<p>参加を受け付けているゼミはありません。</p><a href="/seminars/#catalog">ゼミ一覧に戻る</a>';
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

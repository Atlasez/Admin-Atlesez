const site = document.querySelector<HTMLElement>("[data-site]");

if (site) {
  const menu = site.querySelector<HTMLElement>("[data-site-menu]");
  const menuToggle =
    site.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const closeMenu = () => {
    if (!menu || !menuToggle) return;
    menu.hidden = true;
    desktopMenuTriggers.forEach((item) =>
      item.setAttribute("aria-expanded", "false"),
    );
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
    document.body.style.overflow = "";
  };

  menuToggle?.addEventListener("click", () => {
    if (!menu || !menuToggle) return;
    const open = menu.hidden;
    menu.hidden = !open;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute(
      "aria-label",
      open ? "Close navigation" : "Open navigation",
    );
    document.body.style.overflow = open ? "hidden" : "";
  });
  site.querySelector("[data-menu-close]")?.addEventListener("click", closeMenu);
  menu
    ?.querySelectorAll<HTMLAnchorElement>("a")
    .forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  const menuTabs = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-menu-tab]"),
  ];
  const menuPanels = [
    ...site.querySelectorAll<HTMLElement>("[data-menu-panel]"),
  ];
  menuTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      const active = tab.dataset.menuTab;
      menuTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      menuPanels.forEach((panel) => {
        panel.hidden = panel.dataset.menuPanel !== active;
      });
    }),
  );

  const desktopMenuTriggers = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-desktop-menu]"),
  ];
  desktopMenuTriggers.forEach((trigger) =>
    trigger.addEventListener("click", () => {
      if (!menu || !menuToggle) return;
      const category = trigger.dataset.desktopMenu;
      const tab = menuTabs.find((item) => item.dataset.menuTab === category);
      const alreadyOpen =
        !menu.hidden && trigger.getAttribute("aria-expanded") === "true";
      desktopMenuTriggers.forEach((item) =>
        item.setAttribute("aria-expanded", "false"),
      );
      if (alreadyOpen) {
        closeMenu();
        return;
      }
      menu.hidden = false;
      menuToggle.setAttribute("aria-expanded", "true");
      menuToggle.setAttribute("aria-label", "Close navigation");
      trigger.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      tab?.click();
    }),
  );

  const root = document.documentElement;
  const themeButton = site.querySelector<HTMLButtonElement>(
    "[data-theme-toggle]",
  );
  const themeLabel = site.querySelector<HTMLElement>("[data-theme-label]");
  themeButton?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    themeButton.setAttribute(
      "aria-label",
      `Switch to ${next === "dark" ? "light" : "dark"} mode`,
    );
    if (themeLabel)
      themeLabel.textContent = `${next === "dark" ? "Light" : "Dark"} mode`;
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeColor?.setAttribute(
      "content",
      next === "dark"
        ? "#080808"
        : root.dataset.page === "colossus"
          ? "#ffffff"
          : "#efefec",
    );
  });

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const metricValues = [
    ...site.querySelectorAll<HTMLElement>("[data-count-end]"),
  ];
  const finishMetric = (metric: HTMLElement) => {
    const decimals = Number(metric.dataset.countDecimals ?? 0);
    const end = Number(metric.dataset.countEnd ?? 0);
    metric.textContent = `${metric.dataset.countPrefix ?? ""}${end.toFixed(decimals)}${metric.dataset.countSuffix ?? ""}`;
  };
  const countMetric = (metric: HTMLElement) => {
    const start = Number(metric.dataset.countStart ?? 0);
    const end = Number(metric.dataset.countEnd ?? 0);
    const decimals = Number(metric.dataset.countDecimals ?? 0);
    const prefix = metric.dataset.countPrefix ?? "";
    const suffix = metric.dataset.countSuffix ?? "";
    const startedAt = performance.now();
    const duration = 1200;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const current = start + (end - start) * eased;
      metric.textContent = `${prefix}${current.toFixed(decimals)}${suffix}`;
      if (progress < 1) requestAnimationFrame(tick);
      else finishMetric(metric);
    };
    requestAnimationFrame(tick);
  };
  if (reducedMotion) {
    metricValues.forEach(finishMetric);
  } else if ("IntersectionObserver" in window) {
    const metricObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          countMetric(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.45 },
    );
    metricValues.forEach((metric) => metricObserver.observe(metric));
  } else {
    metricValues.forEach(finishMetric);
  }

  const heroVerb = site.querySelector<HTMLElement>("[data-hero-verb]");
  if (heroVerb && !reducedMotion) {
    const words = ["build", "reason", "imagine", "discover"];
    let index = 0;
    window.setInterval(() => {
      heroVerb.classList.add("is-changing");
      window.setTimeout(() => {
        index = (index + 1) % words.length;
        heroVerb.textContent = words[index];
        heroVerb.classList.remove("is-changing");
      }, 200);
    }, 3200);
  }

  const codeSample = site.querySelector<HTMLElement>("[data-code-sample]");
  const codeTabs = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-code-tab]"),
  ];
  codeTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      codeTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      if (codeSample) codeSample.textContent = tab.dataset.codeContent ?? "";
    }),
  );
  site
    .querySelectorAll<HTMLButtonElement>("[data-copy-code]")
    .forEach((button) =>
      button.addEventListener("click", async () => {
        const content =
          button.closest(".code-panel")?.querySelector("[data-code-sample]")
            ?.textContent ?? "";
        const oldText = button.textContent;
        try {
          await navigator.clipboard.writeText(content);
          button.textContent = "Copied ✓";
        } catch {
          button.textContent = "Select code to copy";
        }
        window.setTimeout(() => {
          button.textContent = oldText;
        }, 1600);
      }),
    );

  const planPanel = site.querySelector<HTMLElement>("[data-plan-panel]");
  const pricingTabs = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-pricing-tab]"),
  ];
  pricingTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      if (!planPanel) return;
      const planData = JSON.parse(planPanel.dataset.planData ?? "{}") as Record<
        string,
        Plan[]
      >;
      const plans = planData[tab.dataset.pricingTab ?? "Individual"] ?? [];
      pricingTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      planPanel.replaceChildren(
        ...plans.map((plan, index) =>
          createPlanCard(plan, index, tab.dataset.pricingTab ?? "Individual"),
        ),
      );
    }),
  );

  const timelinePoints = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-timeline-point]"),
  ];
  timelinePoints.forEach((point, index) =>
    point.addEventListener("click", () => {
      const item = JSON.parse(point.dataset.timelineItem ?? "{}") as {
        date?: string;
        title?: string;
        detail?: string;
      };
      timelinePoints.forEach((candidate) => {
        const selected = candidate === point;
        candidate.classList.toggle("active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      const title = site?.querySelector<HTMLElement>("[data-timeline-title]");
      const detail = site?.querySelector<HTMLElement>("[data-timeline-copy]");
      const date = site?.querySelector<HTMLElement>("[data-timeline-date]");
      const progress = site?.querySelector<HTMLElement>(
        "[data-timeline-progress]",
      );
      if (title) title.textContent = item.title ?? "Milestone";
      if (detail) detail.textContent = item.detail ?? "";
      if (date) date.textContent = item.date ?? "";
      if (progress)
        progress.style.width = `${(index / Math.max(1, timelinePoints.length - 1)) * 100}%`;
    }),
  );

  const useCases: Record<string, [string, string]> = {
    Sales: [
      "Sales outreach",
      "Preparing a short account brief and drafting a first message.",
    ],
    Research: [
      "Research brief",
      "Finding primary sources and organizing the most useful evidence.",
    ],
    Expenses: [
      "Expense review",
      "Checking receipts against policy and flagging unusual charges.",
    ],
    Support: [
      "Customer support",
      "Looking up a recent order and preparing a helpful reply.",
    ],
    Product: [
      "Product feedback",
      "Grouping customer requests and sharing emerging themes.",
    ],
  };
  const caseTabs = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-usecase-tab]"),
  ];
  caseTabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      caseTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      const [title, detail] =
        useCases[tab.dataset.usecaseTab ?? "Sales"] ?? useCases.Sales;
      const titleNode = site?.querySelector<HTMLElement>(
        "[data-usecase-title]",
      );
      const detailNode = site?.querySelector<HTMLElement>(
        "[data-usecase-description]",
      );
      if (titleNode) titleNode.textContent = title;
      if (detailNode) detailNode.textContent = detail;
    }),
  );

  const modeButtons = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-imagine-mode]"),
  ];
  let imagineMode = "Image";
  modeButtons.forEach((button) =>
    button.addEventListener("click", () => {
      imagineMode = button.dataset.imagineMode ?? "Image";
      modeButtons.forEach((item) =>
        item.classList.toggle("active", item === button),
      );
    }),
  );
  site
    .querySelector<HTMLButtonElement>("[data-imagine-generate]")
    ?.addEventListener("click", () => {
      const prompt = site
        ?.querySelector<HTMLTextAreaElement>("[data-imagine-prompt]")
        ?.value.trim();
      const status = site?.querySelector<HTMLElement>("[data-imagine-status]");
      if (status)
        status.textContent = prompt
          ? `${imagineMode} preview ready for “${prompt}”. Generation is a local visual demo; no API was called.`
          : "Add a description to preview the local demo state.";
    });

  const sampleStatus = site.querySelector<HTMLElement>("[data-voice-status]");
  const samples = [
    ...site.querySelectorAll<HTMLButtonElement>("[data-voice-sample]"),
  ];
  const transcripts: Record<string, string> = {
    "Customer support":
      "“I can help with that order. Let me check the delivery status for you.”",
    "Sales associate":
      "“Tell me what your team is working on, and I can suggest a useful next step.”",
    "Lead qualification":
      "“Thanks for reaching out. What would you like to accomplish this quarter?”",
  };
  samples.forEach((sample) =>
    sample.addEventListener("click", () => {
      samples.forEach((item) =>
        item.classList.toggle("active", item === sample),
      );
      if (sampleStatus)
        sampleStatus.textContent = `${transcripts[sample.dataset.voiceSample ?? ""] ?? "Sample selected."} Audio playback is not connected.`;
    }),
  );
  site
    .querySelectorAll<HTMLButtonElement>("[data-voice-demo]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const card = button.closest<HTMLElement>(".voice-preview-card");
        const playing = card?.classList.toggle("is-playing") ?? false;
        button.textContent = playing ? "Ⅱ  Pause sample" : "▶  Play sample";
      }),
    );

  const sections = [...site.querySelectorAll<HTMLElement>("main section")];
  sections.forEach((section) => section.setAttribute("data-reveal", ""));
  if ("IntersectionObserver" in window && !reducedMotion) {
    site.classList.add("reveal-ready");
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0, rootMargin: "0px 0px -45px 0px" },
    );
    sections.forEach((section) => observer.observe(section));
  }
}

type Plan = {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
};

function createPlanCard(
  plan: Plan,
  index: number,
  category: string,
): HTMLElement {
  const card = document.createElement("article");
  card.className = `plan-card${index === 1 ? " featured" : ""}`;
  const top = document.createElement("div");
  top.className = "plan-top";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = index === 1 ? "Most popular" : category;
  const name = document.createElement("h2");
  name.textContent = plan.name;
  const price = document.createElement("p");
  price.className = "plan-price";
  const amount = document.createElement("strong");
  amount.textContent = plan.price;
  const period = document.createElement("span");
  period.textContent = plan.period;
  price.append(amount, period);
  const description = document.createElement("p");
  description.className = "plan-description";
  description.textContent = plan.description;
  top.append(eyebrow, name, price, description);
  const features = document.createElement("ul");
  plan.features.forEach((feature) => {
    const item = document.createElement("li");
    const check = document.createElement("span");
    check.textContent = "✓";
    item.append(check, document.createTextNode(feature));
    features.append(item);
  });
  const link = document.createElement("a");
  link.className = `button ${index === 1 ? "button-light" : "button-outline"}`;
  link.href = "https://grok.com/?referrer=pricing";
  link.target = "_blank";
  link.rel = "noreferrer";
  link.append(
    document.createTextNode(
      index === 0
        ? "Get started"
        : index === 1
          ? `Choose ${plan.name}`
          : "Choose plan",
    ),
  );
  const arrow = document.createElement("span");
  arrow.textContent = "↗";
  link.append(arrow);
  card.append(top, features, link);
  return card;
}

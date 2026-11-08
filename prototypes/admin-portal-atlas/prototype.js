(() => {
  const menuButton = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector(".primary-nav");
  const searchButton = document.querySelector("[data-search-toggle]");
  const searchPanel = document.querySelector("[data-search-panel]");
  const searchInput = document.querySelector("[data-search-input]");
  const searchResults = document.querySelector("[data-search-results]");
  const notificationButtons = [
    ...document.querySelectorAll("[data-notification-toggle]"),
  ];
  const notificationPanel = document.querySelector("[data-notification-panel]");
  const settingsButton = document.querySelector("[data-settings-toggle]");
  const settingsPanel = document.querySelector("[data-settings-panel]");
  const fontSlider = document.querySelector("[data-font-scale]");
  const fontSizeValue = document.querySelector("[data-font-size-value]");
  const toast = document.querySelector("[data-toast]");
  let toastTimer;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = menuButton.getAttribute("aria-expanded") === "true";
      menuButton.setAttribute("aria-expanded", String(!open));
      document.body.classList.toggle("menu-open", !open);
    });
  }

  function closePopover(panel, trigger) {
    if (panel && trigger) {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    }
  }

  if (searchButton && searchPanel) {
    searchButton.addEventListener("click", () => {
      const open = searchButton.getAttribute("aria-expanded") === "true";
      closePopover(notificationPanel, notificationButtons[0]);
      closePopover(settingsPanel, settingsButton);
      searchPanel.hidden = open;
      searchButton.setAttribute("aria-expanded", String(!open));
      if (!open) searchInput?.focus();
    });
  }

  if (notificationPanel) {
    for (const notificationButton of notificationButtons) {
      notificationButton.addEventListener("click", () => {
        const open = notificationPanel.hidden === false;
        closePopover(searchPanel, searchButton);
        closePopover(settingsPanel, settingsButton);
        notificationPanel.hidden = open;
        for (const trigger of notificationButtons)
          trigger.setAttribute("aria-expanded", String(!open));
      });
    }
  }

  if (settingsButton && settingsPanel) {
    settingsButton.addEventListener("click", () => {
      const open = settingsButton.getAttribute("aria-expanded") === "true";
      closePopover(searchPanel, searchButton);
      closePopover(notificationPanel, notificationButtons[0]);
      settingsPanel.hidden = open;
      settingsButton.setAttribute("aria-expanded", String(!open));
    });
  }

  if (searchInput && searchResults) {
    const searchable = [
      ...document.querySelectorAll(
        'a[href^="https://admin.atlasez.org/admin/"], .project-card',
      ),
    ];
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLocaleLowerCase("ja");
      searchResults.replaceChildren();
      if (!query) return;
      const matches = searchable.filter((item) =>
        item.textContent.toLocaleLowerCase("ja").includes(query),
      );
      for (const item of matches.slice(0, 8)) {
        const link = document.createElement("a");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = item.textContent.trim();
        searchResults.append(link);
      }
      if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "一致する項目がありません";
        searchResults.append(empty);
      }
    });
  }

  if (fontSlider) {
    fontSlider.addEventListener("input", () => {
      document.documentElement.style.setProperty(
        "--font-scale",
        String(fontSlider.value),
      );
      if (fontSizeValue)
        fontSizeValue.textContent = `${Math.round(Number(fontSlider.value) * 100)}%`;
    });
  }

  document.querySelectorAll("[data-demo-message]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (element.tagName === "A") event.preventDefault();
      showToast(element.dataset.demoMessage);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopover(searchPanel, searchButton);
      closePopover(notificationPanel, notificationButtons[0]);
      closePopover(settingsPanel, settingsButton);
      for (const trigger of notificationButtons)
        trigger.setAttribute("aria-expanded", "false");
      if (menuButton) {
        menuButton.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
      }
    }
  });
})();

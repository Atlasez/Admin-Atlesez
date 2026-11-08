# Atlasez ADMIN portal and Atlas prototypes

This folder contains two standalone, static prototypes based on the current ADMIN portal and Atlas pages. Nothing here is imported by Astro, added to ADMIN routes, or served by the Worker. The pages use local HTML/CSS/JavaScript and a copied logo asset; they do not call an API or use authentication.

## Preview

Start a local static server from the repository root:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory prototypes/admin-portal-atlas
```

Open `http://127.0.0.1:4173/` for the index, `http://127.0.0.1:4173/portal.html` for the portal prototype, or `http://127.0.0.1:4173/atlas.html` for the Atlas prototype.

The sample content is fixed and local. Portal cards for Atlasez operations and Atlas stay in this prototype. Other ADMIN links open the matching production URL in a new tab for reference; they do not change this static prototype. Search, display size, notifications, and the mobile menu are local preview interactions only. The logout control intentionally shows a prototype-only notice.

## Verification

With repository dependencies installed, run:

```sh
npx playwright test --config prototypes/admin-portal-atlas/playwright.config.ts
```

The suite captures desktop (1440×1000), tablet (768×1024), and mobile (390×844) screenshots for both pages, checks responsive overflow and page structure, and runs axe accessibility checks. See [AUDIT.md](./AUDIT.md) for the read-only audit, screenshot reference notes, and classified findings.

## Scope

Do not import these files into `src/`, add Astro routes, or connect them to the live app. This prototype does not alter the existing ADMIN pages, routes, API behavior, permissions, authentication, database, or deployment configuration.

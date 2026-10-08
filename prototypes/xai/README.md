# x.ai independent UI prototype

This is a standalone visual prototype based on observation of public pages at [x.ai](https://x.ai/). Its source, build, navigation, and interactions are isolated under `prototypes/xai/`. The ADMIN Worker only exposes the read-only static output at `/xai-prototype/`; the prototype has no ADMIN navigation, authentication, API, D1, or Durable Object integration. It includes a visible non-affiliation notice and `noindex` metadata.

The prototype has its own Astro static site and direct routes for Home, Company, Careers, News and its 84 story pages, Colossus, API, Pricing, Grok, Build, Bot, Imagine, and Voice. Product actions that would require an account or backend open official public product/docs pages; local demos are labelled as visual-only and do not call xAI APIs.

## Run locally

From this directory:

```sh
npm install
npm run dev
```

Astro serves at `http://localhost:4321` by default. You can open every route directly, for example `/company/`, `/api/`, `/pricing/`, and `/colossus/`.

The ADMIN production build uses the root project's Astro installation, builds this site with the `/xai-prototype/` base path, and copies its static output to `dist/xai-prototype/`. Its production URL is `https://admin.atlasez.org/xai-prototype/` after the reviewed `main` change is deployed through Workers Builds.

## Build and check

From this directory:

```sh
npm run check
npm run build
npm test
```

The Playwright suite starts the isolated development server on port 4322, checks direct routes and interactions, verifies common viewport widths, and writes local screenshots to `test-results/`. It does not fetch or compare a reference screenshot, so it reports functional and layout checks rather than a pixel-difference score.

## Design and implementation notes

- Astro static output keeps the prototype independent and avoids adding a client framework for mostly static pages.
- `src/styles/xai-prototype.css` contains the shared dark UI tokens, page layouts, responsive breakpoints, and reduced-motion behavior.
- `src/scripts/xai-prototype.ts` implements the menu, accessible category tabs, code and pricing tabs, theme switch, timeline, and honest local product demos.
- The `xVf` and `Geist Mono` font files observed on the public reference are bundled locally for typography fidelity. Colossus imagery is referenced from the public x.ai media CDN because the browser could render it but its asset exporter could not bundle it. The deployment retains non-affiliation messaging and `noindex`; reuse rights for these reference assets have not been independently verified.
- The public site was inspected in the in-app browser. Headless requests to x.ai return Cloudflare 403, and the browser observation surface cannot export reference screenshots, so no reference/local pixel-difference score is claimed. Local screenshots and responsive/interaction checks are saved under `test-results/`.

Keep the prototype clearly independent from xAI and SpaceXAI. If hosted, retain its non-affiliation notice and `noindex` metadata.

# KonNx Website Rules

These rules are mandatory for every agent and developer working in this repository. Read this file before editing. Do not invent a parallel structure, naming scheme, or styling system.

The site is static HTML / CSS / JS today and will be converted to PHP (WordPress) later. Write code that can move into theme template parts without a rewrite. **Do not convert to PHP until explicitly asked.**

---

## 1. Project shape

```
pages/                          # One folder per route. Each route is index.html.
  index.html                    # Home. Body MUST have class homePage.
  home.css / home.js            # Home-only CSS/JS, colocated with the page.
  about-us/
  contact-us/
  products/low-voltage-connectors/
  products/high-voltage-connectors/
  products/styling/product-range.css   # Shared product-detail stylesheet
components/
  layout/header/                # header.html + header.css + header.js
  layout/footer/
  layout/map/
  search/
  ui/cta/                       # Shared pill buttons. Never restyle .pillBtn in a page sheet.
assets/
  css/global.css                # Reset + skip link + .sr-only only.
  js/includes.js                # Partial loader. Loads sibling .css/.js of each data-include.
  js/scroll-target.js           # Hash scrolling. Auto-loaded after includes.
  images/
```

- One concern per file. Page CSS does not style the header. Header CSS does not style page sections.
- Shared UI lives in `components/`. Page-specific layout lives in the page CSS file.
- **Do not recreate** `components/layout/sales-enquiries/`. That section was removed site-wide. Enquiries go through `pages/contact-us/index.html` (`#contactForm`).

---

## 2. PHP / WordPress readiness (do not convert yet)

Keep the static site in a shape WordPress can absorb:

| Static now | WordPress later |
|---|---|
| `<div data-include="/components/layout/header/header.html">` | `get_header()` / `get_template_part('template-parts/layout/header')` |
| Footer / map includes | `get_footer()` / `get_template_part(...)` |
| Page HTML inside `<main id="main">` | The page template |
| Colocated `page.css` / `page.js` | Enqueued in `functions.php` |
| Root-absolute `/assets/...` and `/components/...` | `get_template_directory_uri()` |

Rules that make the conversion cheap:

- Keep the WordPress comments already on partials (`<!-- → WordPress: get_header() -->`).
- Every HTML partial **must** end with a `</body>` sentinel so Live Server does not inject mid-SVG. `includes.js` strips it.
- No build step, no bundler, no JSX, no CSS modules, no npm-required syntax.
- JavaScript is an IIFE using `var` / `function`. No `import`/`export`, no TypeScript, no jQuery.
- Prefer root-absolute URLs for anything shared (`/assets/...`, `/components/...`, `/pages/...`). Page-local CSS/JS may stay relative (`./home.css`).
- Do not hard-code secrets, do not add a CMS besides the existing `data-cms-link` hooks.
- Forms stay static (no PHP mailer) until the PHP conversion.

---

## 3. HTML

- First line is `<!DOCTYPE html>` (uppercase). Language is `lang="en-GB"`.
- Reuse the existing head block: charset, viewport, title, description, robots, author, theme-color, canonical, Open Graph, Twitter, favicon, CSP, JSON-LD, font preconnect, page CSS, `cta.css`.
- Home is the only page that gets `<body class="homePage">`. That class drives the transparent header and the larger logo. Never add `homePage` elsewhere.
- Structure: skip link (in the header partial) → header include → search include → `<main id="main">` → footer include → `includes.js` → optional page JS.
- Class names are **camelCase**: `heroSection`, `introLead`, `pillBtn`. Not BEM, not kebab-case, not snake_case. The footer still uses a few BEM leftovers (`site-footer`, `brand__logo`); do not spread that. If you touch the footer, migrate those classes to camelCase and update `footer.css` in the same change.
- Section shells: `<section class="section ...">` wrapping `<div class="container">` except full-bleed heroes.
- Copy shared sections **code-for-code**. The home intro band is the same markup and type scale as the HV/LV `introSection`. Do not restyle it into a one-off.
- No commented-out blocks of leftover UI. Delete unused markup.
- Images: `width` + `height` + `decoding="async"`. Decorative images get `alt=""` and `aria-hidden="true"` where needed. LCP hero images get `fetchpriority="high"`.
- Buttons that are links use the shared pill markup from `components/ui/cta/cta.html` (classes `pillBtn btn-white` or `pillBtn btn-blue`). Do not invent a second button.

---

## 4. CSS

- **Literal values only.** No design tokens, no Sass, no `clamp()`. A local custom property is allowed only for a repeated calculation inside one component (example: `--safetyIconD` on the home safety icons). Do not put custom properties in `global.css`.
- Breakpoints, always this list, always `max-width`, media query directly under the selector it scales:

  `1600 / 1024 / 768 / 480 / 420 / 380`

  Desktop nav collapses at **1024**. Do not add 900 except where a specific layout already uses it as a stack point (home hero / product cards).
- Each page CSS file is self-contained. Repeat the `.section` / `.container` / `.sectionTitle` / `.accent` literals rather than reaching into another page's sheet.
- Do not redeclare `.pillBtn` (or its variants) in a page sheet. Layout-only extras (`min-width`, `margin`, grid placement) may be added via a page-specific class such as `.heroCta` / `.innovationsCta`.
- Type:
  - Headings / UI / nav / pills: `"Archivo", "Arial Narrow", sans-serif`
  - Body copy: `"Calibri", "Carlito", "Segoe UI", sans-serif`
- Colour:
  - Navy `#263978`
  - Orange accent `#ff6a14`
  - Grey band `#cececc`
  - White `#ffffff` / black `#000000`
  - Footer grey `#5f5e5e`
- Motion: honour `prefers-reduced-motion`. Entrance animations use `cubic-bezier(0.22, 1, 0.36, 1)` or `cubic-bezier(0.45, 0, 0.2, 1)`. Header chrome transitions are `0.35s ease-in-out`.
- Do not introduce `!important` except where a third-party/user-agent style cannot be beaten any other way (the footer credit link is the existing exception).

---

## 5. JavaScript

- One IIFE per file. Feature-detect, then bail if the root node is missing (`if (!header) return;`).
- Colocated component JS is fetched and inlined by `includes.js`. Page JS is a normal `<script src="./page.js">` after `includes.js`.
- Header logic (transparent top state, hide-on-scroll, mobile nav) lives in `header.js`. Do not duplicate it in `home.js`.
- Map network animation and continent hover live in `components/layout/map/map.js`. Do not copy that into a page file.
- Respect `prefers-reduced-motion: reduce` (skip draws, skip smooth scroll).
- Do not attach listeners to `window` for things a component root can observe.

---

## 6. Header (home-only behaviour)

- Default header is sticky, white, navy text, logo `2.75rem` tall.
- Home only (`body.homePage`): header is `position: fixed` and **transparent** at the top of the hero. Logo uses the white hero mark and is **slightly larger** (`3.15rem` via `.siteHeader .brand` height).
- On scroll (more than 8px), or when the mobile nav / search / products dropdown is open, `header.js` toggles `.is-homeSolid`. The bar becomes white and the logo **shrinks back** to `2.75rem` with the same `0.35s ease-in-out` as the background. Do not drive logo size from a separate scroll listener.
- This larger-logo treatment is **home-only**. Do not apply it on inner pages.
- Product detail pages use `<body data-header-pinned>`: `header.js` skips hide-on-scroll there so the sticky product gallery never jumps. Do not add it to other pages.

---

## 7. Content and spelling

- Body copy uses British English: **tunnelling**, **aluminium**, **colour**. Headings may follow the supplied artwork when it uses US spelling (the home products heading is "Tunneling").
- Voltage copy: `660V`, `3.3kV`, `35kV` / `35,000V` as already used. Do not mix `35kv` and `35 kV`.
- Do not add a Sales & Enquiries section, heading, footer link, or include. Direct users to Contact Us.

---

## 8. Map

- Desktop (`min-width: 1024px`): hover **continents**, not pins. A hovered continent gets a thin clipped land-silhouette outline (under the network pins) and a cursor-following contact card. Pins still animate as a network; they are not the hit target.
- Compact (`max-width: 1024px`): the stacked `.mapLocations` list is the contact UI. Do not rely on hover.
- Region data lives in `map.js` (`MAP_REGION_CONTENT`). Update copy there and in `map.html` together.

---

## 9. What not to do

- Do not convert the site to PHP, React, Next, Tailwind, Bootstrap, or a CSS-in-JS setup.
- Do not add `components/layout/sales-enquiries/` back.
- Do not restyle the HV/LV intro band into a unique home layout. Home uses that section as-is.
- Do not change header logo size on inner pages.
- Do not put page-specific rules in `global.css`.
- Do not use `<!doctype html>` (lowercase), inline styles, or new typefaces.
- Do not commit `.env`, credentials, or generated `_tmp-*` files.
- Do not run git commits unless the user asks.

---

## 10. Definition of done for UI work

- Desktop and a mobile width (`480` or below) were checked.
- Header transparent/solid + logo grow/shrink still work on home.
- Inner pages still have the default white header and `2.75rem` logo.
- Shared components (header, footer, map, pills) still look correct on pages you did not primarily edit.
- No Sales & Enquiries block anywhere in the rendered page.

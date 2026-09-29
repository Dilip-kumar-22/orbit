# Hosting and security headers

ORBIT is static files: any host works. What differs is whether the host lets you set **response
headers**, which is where most of the browser hardening lives. This page says exactly what each host
gets, so nothing is assumed.

## The policy

`scripts/security.mjs` is the single source of truth for the headers. It generates every place they live
and checks them for drift:

```bash
npm run security:sync    # rewrite vercel.json, _headers and the <meta> CSP in index.html
npm run security:check   # fail if any of them is stale (runs in `npm run verify` and in CI)
```

| Header                       | Value                                                                                                                                                                   | Why                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `Content-Security-Policy`    | same-origin only; inline code limited to the import map by hash; `connect-src 'none'`; `object-src 'none'`; `base-uri`/`form-action` `'self'`; `frame-ancestors 'none'` | The page loads only its own files and makes no requests of its own. |
| `X-Content-Type-Options`     | `nosniff`                                                                                                                                                               | Stops MIME sniffing of scripts and styles.                          |
| `Referrer-Policy`            | `strict-origin-when-cross-origin`                                                                                                                                       | No path or query leaks to other sites.                              |
| `Permissions-Policy`         | camera, microphone, geolocation, payment, usb, accelerometer, gyroscope, magnetometer all `()`                                                                          | ORBIT uses none of them.                                            |
| `X-Frame-Options`            | `DENY`                                                                                                                                                                  | Legacy twin of `frame-ancestors 'none'`.                            |
| `Cross-Origin-Opener-Policy` | `same-origin`                                                                                                                                                           | Isolates the page's browsing context group.                         |
| `Strict-Transport-Security`  | `max-age=31536000`                                                                                                                                                      | HTTPS only, for a year.                                             |

The CSP is enforced, not report-only. Report-only is only useful when reports reach something that reads
them, and a static site with no backend has nowhere to send them. Instead the policy is tested against the
real page: the e2e suite runs under these exact headers and fails on any violation. The failure mode is
also mild by design: content never depends on script, so a too-strict policy costs the 3D backdrop, not the
page.

If you add a feature the policy blocks (a font CDN, an analytics script, a `fetch`), add the origin in
`scripts/security.mjs` and run `npm run security:sync`. Do not loosen it with `'unsafe-inline'`.

## What each host applies

| Host                                      | How headers are set      | What ORBIT gets                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**                                | `vercel.json` (included) | Every header above.                                                                                                                                                                                                                                                                                                                                                                      |
| **Netlify**                               | `_headers` (included)    | Every header above. The file must be in the publish directory (the repo root for the source tree, `dist/` for the build; the build copies it).                                                                                                                                                                                                                                           |
| **Cloudflare Pages**                      | `_headers` (included)    | Every header above, same file, same rule.                                                                                                                                                                                                                                                                                                                                                |
| **GitHub Pages**                          | not supported            | **Only the `<meta>` CSP** already in `index.html`. Pages cannot set response headers, so `X-Content-Type-Options`, `Permissions-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy` and HSTS are **not** sent (turn on _Enforce HTTPS_ in Settings > Pages for the transport part). A `<meta>` CSP also cannot carry `frame-ancestors`, so clickjacking protection is absent there. |
| **S3 + CloudFront, nginx, Apache, Caddy** | your server config       | Copy the header list from `_headers`; it is one `name: value` per line.                                                                                                                                                                                                                                                                                                                  |

The demo at `https://dilip-kumar-22.github.io/orbit/` is on GitHub Pages, so it carries the reduced set.
If the headers matter to you, put the site on a host from the first three rows.

## Deploying

**The source tree** (zero build): point the host at the repository root, no build command. This is what
GitHub Pages does from `main` / root. `npm start` serves it locally with the headers applied.

**The optimised build** (`npm run build` -> `dist/`, tree-shaken and hashed, 8 requests instead of 31):

- Vercel: framework preset _Other_, build command `npm run build`, output directory `dist`.
- Netlify / Cloudflare Pages: build command `npm run build`, publish directory `dist`.
- GitHub Pages: choose _Settings > Pages > Source: GitHub Actions_ and use a workflow like this one (it is
  an example, not enabled, so your current Pages setup keeps working):

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
      - id: deployment
        uses: actions/deploy-pages@v4
```

The build uses relative URLs (`base: './'`), so it works under a sub-path such as `/orbit/`.

## Changing the URL (forks and custom domains)

`index.html` carries the demo's absolute URLs in four places: `<link rel="canonical">`, `og:url`,
`og:image` and `twitter:image` (plus any sitemap you add). Point them at your site, then run
`npm run build:og` if you changed `assets/og.svg`. `npm test` fails if the canonical URL, `og:url` and the
image URLs stop agreeing with each other.

## Caching

ORBIT does not set `Cache-Control`; hosts' defaults (revalidate on every visit with an ETag) are safe. For
the optimised build every file under `assets/` has a content hash in its name, so on Vercel, Netlify or
Cloudflare you can give `/assets/*` `Cache-Control: public, max-age=31536000, immutable`. Do not do that for
the source tree: `vendor/three/` keeps the same file names across three.js upgrades.

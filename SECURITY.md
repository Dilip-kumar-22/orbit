# Security policy

## Supported versions

ORBIT is pre-1.0. Security fixes land on `main` and in the latest release once there is one.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting:

**<https://github.com/Dilip-kumar-22/orbit/security/advisories/new>**

Include what you found, how to reproduce it, which files or versions are affected, and the impact you
expect. This is a small project maintained by one person: expect an acknowledgement within a few days and a
fix or a written assessment after that, and coordinated disclosure once a fix is out. If the report form is
not available, open an issue that says only that you have a security report and ask for a private channel
(no details in public).

## What counts

In scope:

- A way to run script in the shipped page or to bypass its Content-Security-Policy.
- Anything that lets the vendored files differ from what `vendor/three/manifest.json` records, or a flaw in
  the vendoring and header-generation scripts that could ship something unintended.
- Unsafe defaults in the headers, config handling (`window.ORBIT_CONFIG`, URL parameters) or the static
  server in `scripts/serve.mjs` (path traversal, dotfile exposure).

Out of scope: vulnerabilities in three.js itself (report them upstream; we will bump the pinned version),
hosting-provider issues, headers a host cannot set (see the table in [docs/HOSTING.md](docs/HOSTING.md)),
attacks that need write access to your local checkout, and heavy GPU load on very weak devices (the quality
tiers and the floor exist to contain that).

## What to expect from ORBIT itself

- No backend, no data collection, no cookies, no storage, no runtime request to any other origin.
- A strict CSP (same-origin only, inline code limited to one import map by hash) plus the headers listed in
  [docs/HOSTING.md](docs/HOSTING.md). On hosts that cannot set headers only the `<meta>` CSP applies.
- three.js is self-hosted, pinned exactly and hashed; `npm run vendor:check` proves the vendored copy
  matches the npm package and still exports everything upstream does. CI also runs `npm audit`, a scan for
  committed secrets and Dependabot for npm and GitHub Actions. Turn on GitHub secret scanning and push
  protection on your fork as well.

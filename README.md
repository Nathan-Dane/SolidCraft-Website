<p align="center">
  <img src="assets/logo.svg" width="96" alt="SolidCraft logo">
</p>

<h1 align="center">SolidCraft Website</h1>

<p align="center">
  The home of SolidCraft: a fast, accessible site with a living geometry backdrop.
</p>

<p align="center">
  <a href="https://github.com/tangency-labs/solidcraft">SolidCraft</a> ·
  <a href="https://solidcraft.io">solidcraft.io</a>
</p>

## What it is

The public site for SolidCraft, the open-source parametric CAD app. It introduces the product, links to downloads, and will grow a plugin browser.

- **Static first.** Real HTML and CSS load instantly; scripts only enhance.
- **A living hero.** A WebGL field of connected geometry, drawn in as the page opens.
- **Gentle on devices.** Everything sleeps when nothing is moving.
- **Accessible.** Keyboard friendly, reduced-motion aware, works without JavaScript.

## Stack

| Area              | Choice                            |
| ----------------- | --------------------------------- |
| Pages             | Astro, static output              |
| Interactive parts | Preact with signals               |
| Styling           | Native CSS with design tokens     |
| Hero              | Custom WebGL renderer, TypeScript |
| Tooling           | pnpm, Biome, strict TypeScript    |
| Tests             | node:test, Playwright, axe        |

## Getting started

You need Node 24 and pnpm.

```sh
pnpm install
pnpm dev
```

Other commands:

| Command          | What it does                 |
| ---------------- | ---------------------------- |
| `pnpm build`     | Builds the site              |
| `pnpm check`     | Formats and lints with Biome |
| `pnpm typecheck` | Type-checks every package    |
| `pnpm test`      | Runs unit tests              |
| `pnpm test:e2e`  | Runs browser tests           |

## Layout

```text
apps/site/     the Astro site
packages/      frame, tokens, field, cursor
```

## Good to know

- **The entrance** plays once per session and is skipped for reduced motion, data saver and scrolled loads. Add `?intro` to see it again and `?nointro` to skip it.
- **Debug switches:** `?gl=software` lets the field run on a software renderer, and `?debug` exposes the field's host as `window.fieldHost`.
- **Budgets:** `pnpm build` followed by `pnpm --filter @solidcraft/site check:output` fails when a built file is over its gzipped limit (field engine 35 KB, cursor 6 KB, other scripts 12 KB, CSS and HTML 12 KB).
- **Idle:** with the hero away and the pointer still, the page asks for no animation frames; the browser tests check it.

## Status

The home page, content pages, field, cursor and entrance are in place. Next up are the mobile menu and the plugin and theme browser.

## Contributing

- **Branches** are named by kind: `feat/`, `fix/`, `chore/`, `refactor/`, `test/`.
- **Commits** are a single short title, no body.
- **Pull requests** stay small and focused on one change.

## License

[MIT](LICENSE)

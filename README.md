# Joshua Constantine Santos — portfolio

A static Astro portfolio with paper textures, film grain, a persistent appearance menu and a reduced-motion option. Astro renders the page and its build-time caption during the build; the browser localizes the last-updated timestamp and handles interactive controls.

## Setup

Use Bun **1.4.2** and Node.js **22.12.0 or newer**. Install the exact dependency graph from the committed text lockfile:

```sh
bun install --frozen-lockfile
bun run dev
```

The Astro development server starts at `http://localhost:4321`. Source pages are in `src/pages/`, reusable components in `src/components/`, and shared styles in `src/styles/`. Imported images live in `src/assets/`; public icons, font files and the web manifest are served from `public/`.

Tailwind **4.3.3** uses its official Vite plugin. The existing JavaScript configuration and custom grain utilities are loaded with `@config`, with explicit compatibility styles preserving the previous paper palette, border/button defaults and spoiler blur. Tailwind 4 requires Safari **16.4+**, Chrome **111+** or Firefox **128+**; see the [migration guide](https://tailwindcss.com/docs/upgrade-guide#browser-requirements). TypeScript **5.9.3** remains within `@astrojs/check`'s supported peer range. Astro's passthrough image service preserves original image assets; no image optimization or server adapter is required.

## Commands

Run these from the project directory:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start Astro's development server. |
| `bun run test` | Run the existing Bun behavior tests. |
| `bun run test:social` | Verify the built homepage metadata, player and preview resources in `dist/`. Run after building. |
| `bun run check` | Check Astro and TypeScript source. |
| `bun run build` | Run tests, source checks and the static build into `dist/`. |
| `bun run preview` | Build, then serve the static output locally with Wrangler at `http://localhost:8787`. |
| `bun run deploy:dry-run` | Build and validate Workers packaging without uploading or deploying. |
| `bun run deploy` | Build and deploy to Cloudflare Workers; this changes the live Worker. |
| `bun run update-stamp` | Write the current UTC timestamp to `src/constants/lastUpdated.ts`. Run intentionally when updating site content. |
| `bun run astro -- --help` | Show Astro CLI options. |

## Social previews

The homepage advertises a direct HTTPS MP4, a JPEG fallback and a standalone HTML player. Both preview images and video use a 1200 × 630 frame. The video is a six-second silent animation; the player has native controls, starts only after interaction and loops seamlessly. The metadata is emitted in the initial HTML, before the page's scripts.

`astro.config.mjs` sets the production origin to `https://www.joshsantos.me`. Canonical and `og:url` values always use that origin. By default, image, MP4 and player URLs do too. When preparing a hosted preview, set `SOCIAL_ASSET_BASE_URL` to its public HTTPS origin at build time so crawlers can fetch that preview's assets. This accepts an origin such as `https://preview.example.com`, without credentials, a path, query or fragment. For example:

```sh
SOCIAL_ASSET_BASE_URL=https://preview.example.com bun run build
```

The editable composition and rendering instructions live in [`media/`](media/README.md). The generated files are `public/social/preview-v1.mp4` and `public/social/preview-v1.jpg`; the player is `public/social/player.html`. Keep these query-free URLs and advance the filename version when replacing published media that platforms may have cached. `bun run build` validates the built metadata and resources after Astro generates `dist/`.

The MP4 and poster support [Messages rich previews](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages) and [Discord video embeds](https://docs.discord.com/developers/link-previews/overview). Open Graph image metadata provides a fallback for consumers that use images. X receives a player card with an HTML player, a direct stream and poster. Each service chooses its rendered preview and cache behavior; local validation does not establish native acceptance in Messages, Discord, Slack, LinkedIn or X. Verify those after an authorized HTTPS deployment.

## Cloudflare Workers Static Assets

`wrangler.toml` serves `dist/` as static assets under the Worker name `portfolio-2024`. There is no Worker script, SSR adapter or runtime binding. Unknown paths return 404 rather than the home page.

Local preparation does not perform the live cutover. Publishing, custom-domain routing and configuring Cloudflare's Git integration still require a separate deployment decision and authorized Cloudflare account access. The current live hosting configuration has not been changed by this migration.

For a future Workers Builds setup, select this project as the root directory and configure the build environment to use Bun `1.4.2` (`BUN_VERSION`) and a supported Node.js version (`NODE_VERSION`, at least `22.12.0`). These belong in the Cloudflare build settings, not Wrangler runtime variables. To enforce the lockfile during hosted builds, set `SKIP_DEPENDENCY_INSTALL=1` and use `bun install --frozen-lockfile && bun run build` as the build command. Use `bun run deploy` as the deploy command. The deploy command repeats the build gates so local and hosted deployment both validate the site. Branches, previews and domains must be configured for the intended account before a live cutover.

Configuration references: [Astro 7 migration](https://docs.astro.build/en/guides/upgrade-to/v7/), [Astro on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [build environment](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), and [Tailwind 4 with Astro](https://tailwindcss.com/docs/installation/framework-guides/astro).

# Side landing page

A responsive English launch page for Product Hunt visitors at https://side.qyinm.xyz. Built with Vite and plain HTML, CSS, and JavaScript. The desktop app is a separate workspace.

## Run

From the repository root:

```sh
bun install --frozen-lockfile
bun run landing:dev
bun run landing:build
bun run landing:preview
```

Requires Node.js 22.18 or later for Cloudflare's configuration loader, plus the repository's Bun version. Development runs at http://localhost:5173. Cloudflare's Vite plugin writes the deployable static assets to `app/landing/.cloudflare/output/v0/`. This site has no Worker application code or server bindings.

## Deploy

Authenticate with `cf auth login`, then run `bun run landing:deploy` from the repository root. This builds the page and runs `cf deploy --prebuilt`. `cloudflare.config.ts` defines the `side-landing` Worker and the custom domain `side.qyinm.xyz`; Cloudflare manages its DNS and TLS certificate.

The build disables Docker discovery using `WRANGLER_DOCKER_BIN=false`: this assets-only site has no containers, and the current beta plugin otherwise queries the local Docker daemon during build cleanup.

## Prepare the launch

Copy `.env.example` to `.env.local` in this workspace and set:

- `VITE_DOWNLOAD_URL`: optional override for the public Mac download URL. By default, all three download links point to the signed, notarized Side 1.0.3 Apple Silicon DMG and work without JavaScript. Update these default links when publishing a new release.
- `VITE_PRODUCT_HUNT_URL`: the published Product Hunt listing URL. The listing link stays hidden until configured.

Rebuild after changing these values. The download must point to a publicly accessible installer.

The installer targets Apple Silicon. The minimum supported macOS version has not yet been verified. The canonical URL and social image URLs use `https://side.qyinm.xyz`. `public/social-card.png` is the 1200 × 630 sharing image; the editable source is `public/social-card.svg`.

The interactive conversation is explicitly a canned demo; it sends no prompts to an AI service and collects no visitor data. The UI scene is marked as an illustrative preview. Google Fonts loads DM Sans and Manrope with system sans-serif fallbacks.

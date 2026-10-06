# Side

One chat, any model — right beside your Dock.

Side is a macOS-first AI chat panel that stays close to whatever you're working on. Ask a quick question from the compact panel, expand it for a longer conversation, and choose your provider and model in the same place.

Bring your own provider account or API key. Side uses [Pi](https://github.com/earendil-works/pi) for its model catalog, authentication, and streaming responses.

## What it does

- Sits beside your Dock and tracks its position. With a bottom Dock, the compact panel fits into the larger gap on either side.
- Stays above other windows and is configured to appear across Spaces, including full-screen apps.
- Expands to the display's usable height when you need room to read, then collapses back to a compact composer.
- Lets you switch providers and models within one conversation. Available options come from Pi's runtime catalog.
- Connects through API keys or provider sign-in, depending on the provider's supported authentication methods.
- Streams responses with Markdown rendering and lets you stop a response in progress.
- Shows or hides with **Command+Shift+Space**.

## Get Side

Side is in early development. A public Mac download is being prepared; for now, run it from source using the instructions below. Final minimum macOS requirements and supported release architectures have not been established.

## First launch

1. Allow Accessibility access when prompted so Side can read the Dock's position. You can manage this in **System Settings → Privacy & Security → Accessibility**. During development, the app may appear as Electron.
2. Expand the panel with the chevron control to see the conversation and provider setup.
3. Choose a provider and model, then connect with one of the authentication methods offered for that provider.
4. Type a message and press **Enter** to send. Use **Shift+Enter** for a new line.

Move the pointer over the compact panel to reveal its controls. Use the chevron to toggle its size, or **Command+Shift+Space** to hide and show it.

Without Dock geometry, Side falls back to a corner of the display. A left or right Dock uses a taller panel beside it; if a bottom Dock leaves too little space, Side positions the panel above it.

Model access, subscription eligibility, and usage charges depend on your provider.

## Build from source

Requires:

- macOS with Swift command-line tools for the native Dock helper.
- **Bun 1.4.0**, as specified in the root `package.json`.
- **Node.js 22.19 or later** for the Pi dependency.

Run all commands from the repository root:

```sh
git clone https://github.com/qyinm/side.git
cd side
bun install --frozen-lockfile
bun run start
```

The development command compiles the Swift Dock helper and starts the Electron app.

Check the desktop app:

```sh
bun run typecheck
bun run lint
```

Package it or create a macOS ZIP distributable:

```sh
bun run package
bun run make
```

Electron Forge writes packaged apps to `app/desktop/out/` and distributables to `app/desktop/out/make/`. The current packaging configuration uses the Icon Composer asset in [`desktop-app-icon.icon`](desktop-app-icon.icon), which requires macOS 26+ and Xcode 26+. An `.icns` fallback is needed to show the custom icon on earlier macOS versions. These are packaging requirements; the minimum macOS version for running the app has not been verified.

## Data and permissions

Side keeps provider credentials and model configuration in `pi/` inside Electron's app-specific user data directory. The Pi runtime uses local files including `auth.json` and `models.json`; these are separate from another Pi installation's configuration.

The conversation lives in memory and is lost when the app quits. Switching models keeps the current conversation context, so subsequent requests may send that context to the newly selected provider.

Sign-in and chat requests use your provider's network endpoints. Automatic network model-catalog refresh is disabled at startup. Accessibility access is used by the native helper to read the Dock's position and size.

## Current limits

- One conversation at a time, with no saved history or cloud sync.
- Text chat only; no file attachments, filesystem tools, or shell execution.
- No external coding-agent or CLI sessions are launched.
- Provider availability and authentication support depend on Pi.
- Models with reasoning support are marked, but reasoning effort is not adjustable in the UI.
- Distribution signing and notarization are not configured in the current Forge configuration.

## Development notes

The desktop app uses Electron Forge, React, and TypeScript, with a Swift helper for Dock positioning. [`packages/pi-agent`](packages/pi-agent) wraps Pi's model and authentication APIs.

See [Desktop development and architecture](app/desktop/README.md) for more details.

## Inspiration

Side's Dock-adjacent form and this README's product-first structure were inspired by [Starboard](https://github.com/palamim/starboard), a persistent macOS terminal panel. Side brings that nearby-panel idea to multi-provider AI chat.

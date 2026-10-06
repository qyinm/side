# Side

A macOS-first, Dock-adjacent chat panel for models configured through Pi. Side uses Pi's provider catalog and authentication flows; it does not launch Codex, OpenCode, Claude Code, or Hermes agent runtimes.

## Development

- Requires Bun 1.4.0 and Node.js 22.19 or later for Pi's coding-agent package.
- From the repository root, run `bun install` and `bun run start`.
- Press `Command+Shift+Space` to toggle the panel.
- On macOS, allow Side to use Accessibility when prompted so it can sit in the larger side gap beside a bottom Dock. It matches the Dock's height and vertical position; use the expand button in the composer to open the full chat panel.
- Run `bun run typecheck` and `bun run package` from the repository root to verify/package the app.
- Run `bun run make` from the repository root to create macOS DMG and ZIP distributables.

The macOS app icon comes from `desktop-app-icon.icon` at the repository root. Packaging this Icon Composer asset requires macOS 26+ and Xcode 26+. An `.icns` fallback is needed to show the custom icon on earlier macOS versions.

Pi credentials and model configuration are isolated under the app's user data directory in `pi/`. The initial runtime starts with network model-catalog refresh disabled; provider sign-in and chat requests use the provider's network endpoints when explicitly invoked.

## Current scope

- One in-memory conversation, model picker, provider sign-in, streaming text, stop, and disconnect.
- Provider/model options come from Pi at runtime rather than a hard-coded vendor list.
- No tools, shell access, coding-agent runtime, cloud sync, or chat-history persistence.
- Provider availability depends on Pi's provider implementations and their supported authentication methods.

## Architecture

- Electron Forge app, window lifecycle, IPC bridge, and renderer UI live in this package.
- `packages/pi-agent` at the repository root encapsulates Pi's provider catalog, credentials, authentication prompts, and direct model streaming.
- The Pi package does not launch a coding-agent runtime, shell, or external CLI; Electron communicates with it through a typed API and events.

## Releases and updates

Publish stable SemVer GitHub releases in `qyinm/side` with both `Side-<version>-arm64.dmg` (installation) and `Side-darwin-arm64-<version>.zip` (automatic updates). Bump this workspace's version before building a new release. Keep the app bundle identifier and Developer ID signing identity consistent between versions.

Packaged macOS apps check `update.electronjs.org/qyinm/side/darwin-arm64/<installed-version>` at launch and hourly. Updates download in the background and prompt the user to restart or apply later. Development builds do not check for updates. Draft and prerelease GitHub releases are not update targets. Existing builds without the updater must first be replaced with an updater-enabled release.

The current release is for Apple Silicon only. Developer ID signing is available; Apple notarization is not configured yet.

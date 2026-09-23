# Side

A macOS-first, Dock-adjacent chat panel for models configured through Pi. Side uses Pi's provider catalog and authentication flows; it does not launch Codex, OpenCode, Claude Code, or Hermes agent runtimes.

## Development

- Requires Node.js 22.19 or later for Pi's coding-agent package.
- From the repository root, run `pnpm install` and `pnpm start`.
- Press `Command+Shift+Space` to toggle the panel.
- On macOS, allow Side to use Accessibility when prompted so it can sit in the larger side gap beside a bottom Dock. It matches the Dock's height and vertical position; use the expand button in the composer to open the full chat panel.
- Run `pnpm typecheck` and `pnpm package` from the repository root to verify/package the app.
- Run `pnpm make` from the repository root to create a macOS ZIP distributable.

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

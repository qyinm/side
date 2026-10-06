# Repository rules

## Package manager

- Use Bun for dependency installation and package scripts in every workspace. Do not use npm, pnpm, or Yarn.
- Use the Bun version specified in the root `package.json` (`packageManager`).
- Keep `bun.lock` as the only dependency lockfile. Do not create npm, pnpm, or Yarn lockfiles.
- Run commands from the repository root:
  - Install dependencies: `bun install`
  - Install without changing the lockfile: `bun install --frozen-lockfile`
  - Start development: `bun run start`
  - Check types: `bun run typecheck`
  - Lint: `bun run lint`
  - Package the app: `bun run package`
  - Create the distributable: `bun run make`
- Use `bun add` / `bun remove` in the target workspace directory when changing its dependencies.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// Exercise OAuth from a desktop-style CJS bundle, without signing in or saving
// credentials. Running the unbundled source would miss computed-import failures.
const directory = await mkdtemp(path.join(tmpdir(), 'side-oauth-bundle-'));
const entry = path.join(directory, 'entry.ts');
const agentPath = fileURLToPath(new URL('../../../packages/pi-agent/src/index.ts', import.meta.url));
try {
  // Bun also lists bundled third-party modules as builtins; use Node's actual
  // list so the check matches Electron's runtime rather than Bun's runtime.
  const builtinModules = JSON.parse(spawnSync('node', [
    '-p', 'JSON.stringify(require("node:module").builtinModules)',
  ], { encoding: 'utf8' }).stdout);
  await writeFile(entry, `
    import assert from 'node:assert/strict';
    import { PiAgent } from ${JSON.stringify(agentPath)};
    async function check() {
      let reachedAuthorization = false;
      const agent = await PiAgent.create({
        runtimeDirectory: ${JSON.stringify(path.join(directory, 'runtime'))},
        onEvent(event) {
          if (event.type === 'auth_event' && event.notification.event.type === 'auth_url') {
            assert.equal(new URL(event.notification.event.url).hostname, 'auth.openai.com');
            reachedAuthorization = true;
          }
          if (event.type === 'auth_prompt') {
            if (event.request.prompt.type === 'select') {
              agent.respondToAuthPrompt(event.request.id, event.request.prompt.options[0].id);
            } else agent.cancelAuthPrompt(event.request.id);
          }
        },
      });
      try {
        await assert.rejects(agent.login('openai-codex', 'oauth'), /cancelled/i);
        assert.ok(reachedAuthorization, 'Bundled Codex OAuth must reach the authorization flow');
      } finally { agent.dispose(); }
      console.log('Bundled Codex OAuth reached authorization; cancelled without credentials.');
    }
    check().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: path.join(directory, 'build'),
      minify: false,
      lib: { entry, formats: ['cjs'], fileName: () => 'check.cjs' },
      rollupOptions: { external: [...builtinModules, ...builtinModules.map(name => `node:${name}`)] },
    },
  });
  const result = spawnSync('node', [path.join(directory, 'build/check.cjs')], {
    encoding: 'utf8', timeout: 15000,
  });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || 'OAuth bundle check failed');
  process.stdout.write(result.stdout);
} finally {
  await rm(directory, { recursive: true, force: true });
}

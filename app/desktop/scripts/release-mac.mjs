import { spawnSync } from 'node:child_process';

// Credentials stay in Keychain; only its non-secret profile name is passed here.
if (process.platform !== 'darwin') throw new Error('macOS is required to create this release.');
for (const name of ['SIDE_NOTARY_PROFILE', 'SIDE_SIGNING_IDENTITY']) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required; see docs/macos-release.md.`);
}

const authentication = spawnSync('xcrun', [
  'notarytool', 'history', '--keychain-profile', process.env.SIDE_NOTARY_PROFILE,
  ...(process.env.SIDE_NOTARY_KEYCHAIN ? ['--keychain', process.env.SIDE_NOTARY_KEYCHAIN] : []),
  '--output-format', 'json',
], { encoding: 'utf8', timeout: 30000 });
if (authentication.status !== 0) {
  const detail = authentication.error?.message || authentication.stderr.trim() || 'No response from notarytool.';
  throw new Error(`Apple notarization authentication failed: ${detail}`);
}

const build = spawnSync('bun', ['run', 'make'], { stdio: 'inherit' });
if (build.error) throw build.error;
process.exit(build.status ?? 1);

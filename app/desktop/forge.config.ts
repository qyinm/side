import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const execFileAsync = promisify(execFile);

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.electron.side',
    osxSign: {
      identity: process.env.SIDE_SIGNING_IDENTITY,
      // These are resources sealed by their bundle, not executable code.
      ignore: '\\.(?:pak|asar|bin|dat|icns|car)$',
    },
    icon: path.resolve(__dirname, '../../desktop-app-icon.icon'),
    extraResource: [
      path.join(__dirname, 'native', 'dock-geometry'),
      ...['LICENSE', 'NOTICE', 'BRANDING.md'].map((file) => path.resolve(__dirname, '../..', file)),
    ],
  },
  rebuildConfig: {},
  hooks: {
    postPackage: async (_config, result) => {
      if (result.platform !== 'darwin') return;
      for (const outputPath of result.outputPaths) {
        await execFileAsync('codesign', [
          '--verify', '--deep', '--strict',
          path.join(outputPath, 'Side.app'),
        ]);
      }
    },
  },
  makers: [
    new MakerDMG({
      format: 'UDZO',
      background: path.join(__dirname, 'resources', 'dmg-background.png'),
      icon: path.resolve(__dirname, '../../desktop-app-icon.icns'),
      iconSize: 80,
      contents: (options) => [
        { x: 190, y: 216, type: 'file', path: options.appPath },
        { x: 468, y: 216, type: 'link', path: '/Applications' },
      ],
      additionalDMGOptions: {
        window: { size: { width: 658, height: 380 } },
      },
    }, ['darwin']),
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;

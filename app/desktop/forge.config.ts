import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
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
    extraResource: [path.join(__dirname, 'native', 'dock-geometry')],
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

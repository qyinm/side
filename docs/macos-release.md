# macOS release

Use `bun run release:mac` for public releases. It requires Apple notarization credentials in Keychain and stops if authentication or notarization fails. `bun run make` remains available for local packaging without notarization when no profile is set.

## Register credentials once

Run this in your own terminal. The prompts collect your Apple ID, an app-specific password, and Team ID without putting a password in shell history or this repository:

```sh
xcrun notarytool store-credentials side-notary
```

Use the Apple Developer team matching the signing identity: `MCP4D3M7XK`. Create an app-specific password through [Apple Account](https://account.apple.com/). Existing App Store Connect API credentials can also be registered using `notarytool store-credentials`; see [Electron Forge's signing guide](https://www.electronforge.io/guides/code-signing/code-signing-macos).

Confirm authentication:

```sh
xcrun notarytool history --keychain-profile side-notary
```

If the profile is stored in a separate Keychain file, also set `SIDE_NOTARY_KEYCHAIN` to that file's path when building.

## Build and verify

Increase `app/desktop/package.json`'s version for each public update, then run from the repository root:

```sh
SIDE_NOTARY_PROFILE=side-notary \
SIDE_SIGNING_IDENTITY='Developer ID Application: dievas (MCP4D3M7XK)' \
bun run release:mac
```

Forge signs and notarizes the app and staples its ticket before making the ZIP and DMG. The post-make hook signs the DMG, submits it to Apple, checks for `Accepted`, staples its ticket, and verifies its signature and disk-image checksum. A rejected submission fails the build; inspect its Apple log before distributing it.

Before uploading, extract the ZIP with `ditto` and check the extracted app, in addition to the packaged app:

```sh
codesign --verify --deep --strict /path/to/Side.app
xcrun stapler validate /path/to/Side.app
spctl --assess --type execute --verbose=2 /path/to/Side.app
xcrun stapler validate /path/to/Side-version-arm64.dmg
spctl --assess --type open --context context:primary-signature --verbose=2 /path/to/Side-version-arm64.dmg
```

Publish the DMG, ZIP, and SHA-256 checksums on a new stable SemVer GitHub Release. Keep the bundle ID and Developer ID consistent for Electron updates. Do not replace an already published ZIP in place: release a higher app version so installed clients can discover it.

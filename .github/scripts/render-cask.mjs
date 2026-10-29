#!/usr/bin/env node
// Render the getmanor/tap Homebrew cask (Casks/manor-edge.rb) from the
// downloads manifest, https://downloads.mymanor.click/latest.json.
//
// The cask installs the same notarized DMG that mymanor.click/download offers
// and installed apps update to: the manifest's production `macDmg` entry.
// Everything except `version` and `sha256` is fixed here, so a reviewed change
// to this file is the only way to change what the cask does.
//
// The getmanor/homebrew-tap repository carries a byte-identical copy at
// .github/scripts/render-cask.mjs and runs it hourly from its own workflow
// (.github/workflows/update-cask.yml). Change this file in the MANOR monorepo
// first, then copy it to the tap.
//
//   node render-cask.mjs --manifest latest.json [--expect-version 1.0.N] [--out manor-edge.rb]
//   node render-cask.mjs --manifest https://downloads.mymanor.click/latest.json
//
// Without --out the cask goes to stdout. Any manifest the download page would
// not offer as the production DMG is rejected with a non-zero exit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOWNLOADS_BASE = 'https://downloads.mymanor.click';
export const MANIFEST_URL = `${DOWNLOADS_BASE}/latest.json`;
// The cask pins `depends_on macos: :ventura`, which Homebrew reads as
// "Ventura or later" (the older `">= :ventura"` string form prints a
// deprecation warning on every brew command since Homebrew 5). A build with
// another minimum needs a reviewed change here, not a silently stale cask.
const MIN_MACOS = '13.0';
const VERSION_RE = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

export class ManifestError extends Error {}

function fail(message) {
  throw new ManifestError(message);
}

// Returns { version, sha256 } for the production DMG, or throws ManifestError.
export function parseMacDmg(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('manifest is not a JSON object');
  const dmg = manifest.macDmg;
  if (!dmg || typeof dmg !== 'object' || Array.isArray(dmg)) fail('manifest has no macDmg entry');
  const { version, path: dmgPath, sha256 } = dmg;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) fail(`macDmg.version is not a release version: ${JSON.stringify(version)}`);
  const expectedPath = `releases/app/${version}/ManorEdge.dmg`;
  if (dmgPath !== expectedPath) fail(`macDmg.path must be ${expectedPath}, got ${JSON.stringify(dmgPath)}`);
  if (dmg.versionedUrl !== undefined && dmg.versionedUrl !== `${DOWNLOADS_BASE}/${expectedPath}`) {
    fail(`macDmg.versionedUrl must be ${DOWNLOADS_BASE}/${expectedPath}, got ${JSON.stringify(dmg.versionedUrl)}`);
  }
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) fail('macDmg.sha256 is not a lowercase SHA-256 hex digest');
  if (dmg.kind !== 'mac-dmg-notarized') fail(`macDmg.kind must be mac-dmg-notarized, got ${JSON.stringify(dmg.kind)}`);
  if (dmg.environment !== 'production') fail(`macDmg.environment must be production, got ${JSON.stringify(dmg.environment)}`);
  if (dmg.minMacOS !== MIN_MACOS) fail(`macDmg.minMacOS must be ${MIN_MACOS} (the cask requires Ventura), got ${JSON.stringify(dmg.minMacOS)}`);
  return { version, sha256 };
}

export function renderCask({ version, sha256 }) {
  if (!VERSION_RE.test(version)) fail(`not a release version: ${JSON.stringify(version)}`);
  if (!SHA256_RE.test(sha256)) fail('not a lowercase SHA-256 hex digest');
  return `# Rendered from ${MANIFEST_URL} (macDmg).
# Do not edit by hand: the tap's update-cask workflow re-renders it hourly
# and commits when a new production release appears.
cask "manor-edge" do
  version "${version}"
  sha256 "${sha256}"

  url "${DOWNLOADS_BASE}/releases/app/#{version}/ManorEdge.dmg"
  name "MANOR Edge"
  desc "Menu bar app that runs a home's on-site edge"
  homepage "https://mymanor.click/download"

  livecheck do
    url "${MANIFEST_URL}"
    strategy :json do |json|
      json.dig("macDmg", "version")
    end
  end

  # The app updates itself (Sparkle, signed feed); brew upgrade leaves it alone.
  auto_updates true
  depends_on arch: :arm64
  depends_on macos: :ventura

  app "ManorEdge.app"

  # Premium edge services keep running without the app. A Free edge runs
  # inside the app, so it pauses until the app is opened again.
  uninstall quit: "com.manor.edge.menubar"

  # Only the app's own caches and preferences. Pairing and edge state are not
  # the app's to delete: Free ~/.manor-free-edge-native-test, Premium
  # ~/manor-edge, the root-owned /Library/Application Support/MANOR, and the
  # edge-managed ~/Library/LaunchAgents/com.manor.edge.menubar.plist.
  # Disconnect This Mac… in the app removes an edge.
  zap trash: [
    "~/Library/Caches/com.manor.edge.menubar",
    "~/Library/HTTPStorages/com.manor.edge.menubar",
    "~/Library/Preferences/com.manor.edge.menubar.plist",
    "~/Library/Saved Application State/com.manor.edge.menubar.savedState",
    "~/Library/WebKit/com.manor.edge.menubar",
  ]

  caveats <<~EOS
    Open MANOR Edge from Applications to pair this Mac with a key from your account.

    Uninstalling the app does not disconnect this Mac from its home.
    To remove the edge, choose Disconnect This Mac… in the app first.
  EOS
end
`;
}

async function readManifest(source) {
  if (/^https:\/\//.test(source)) {
    const response = await fetch(source, { redirect: 'error', cache: 'no-store' });
    if (!response.ok) fail(`${source}: HTTP ${response.status}`);
    return response.json();
  }
  if (/^[a-z]+:\/\//i.test(source)) fail(`only https manifests are accepted: ${source}`);
  const text = fs.readFileSync(source === '-' ? 0 : source, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${source}: not JSON (${error.message})`);
  }
}

function parseArgs(argv) {
  const options = { manifest: null, out: null, expectVersion: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const key = { '--manifest': 'manifest', '--out': 'out', '--expect-version': 'expectVersion' }[flag];
    if (!key || i + 1 >= argv.length) throw new ManifestError(`usage: render-cask.mjs --manifest <file|https-url|-> [--expect-version <v>] [--out <file>] (bad argument ${JSON.stringify(flag)})`);
    options[key] = argv[(i += 1)];
  }
  if (!options.manifest) throw new ManifestError('usage: render-cask.mjs --manifest <file|https-url|-> [--expect-version <v>] [--out <file>]');
  return options;
}

export async function main(argv) {
  const options = parseArgs(argv);
  const release = parseMacDmg(await readManifest(options.manifest));
  if (options.expectVersion !== null && release.version !== options.expectVersion) {
    fail(`manifest offers ${release.version}, expected ${options.expectVersion}`);
  }
  const cask = renderCask(release);
  if (options.out) {
    // Write beside the target, then rename: a failed render never leaves a
    // partial cask behind.
    const temp = path.join(path.dirname(options.out), `.${path.basename(options.out)}.${process.pid}.tmp`);
    fs.writeFileSync(temp, cask, { mode: 0o644 });
    fs.renameSync(temp, options.out);
  } else {
    process.stdout.write(cask);
  }
  return release;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (release) => process.stderr.write(`manor-edge cask ${release.version}\n`),
    (error) => {
      process.stderr.write(`render-cask: ${error instanceof ManifestError ? error.message : error.stack}\n`);
      process.exit(1);
    },
  );
}

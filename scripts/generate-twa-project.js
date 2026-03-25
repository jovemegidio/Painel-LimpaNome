const fs = require('fs');
const path = require('path');

const bubblewrapCore = require(
  'C:/Users/Administrator/AppData/Roaming/npm/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core'
);

const { TwaGenerator, TwaManifest, ConsoleLog } = bubblewrapCore;

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const manifestPath = path.join(rootDir, 'twa-manifest.json');
  const outputDir = path.join(rootDir, 'android-twa');
  const keystorePath = path.join(rootDir, 'android', 'credbusiness.keystore');

  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const normalized = {
    ...raw,
    appVersion: raw.appVersion || raw.appVersionName || '1.0.0',
    maskableIconUrl: raw.iconUrl,
    splashScreenFadeOutDuration: raw.splashScreenFadeOutDuration || 300,
    signingKey: {
      path: keystorePath,
      alias: (raw.signingKey && raw.signingKey.alias) || 'credbusiness',
    },
    shortcuts: [],
  };

  const manifest = new TwaManifest(normalized);
  const validationError = manifest.validate();
  if (validationError) {
    throw new Error(`Invalid normalized TWA manifest: ${validationError}`);
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const generator = new TwaGenerator();
  const log = new ConsoleLog('generate-twa-project');

  await generator.createTwaProject(outputDir, manifest, log, (current, total) => {
    console.log(`[${current}/${total}] generating Android project`);
  });

  console.log(`Project created at: ${outputDir}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
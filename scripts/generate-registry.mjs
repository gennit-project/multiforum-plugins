#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');
const outRoot = path.join(repoRoot, 'out');

const parseArgs = () => {
  const args = process.argv.slice(2);
  let version = process.env.VERSION || '';
  let bucket = process.env.BUCKET || 'gs://mf-plugins-prod';
  let outputPath = path.join(repoRoot, 'registry.json');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version' && args[i + 1]) {
      version = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--version=')) {
      version = arg.split('=')[1];
    } else if (arg === '--bucket' && args[i + 1]) {
      bucket = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--bucket=')) {
      bucket = arg.split('=')[1];
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      outputPath = path.resolve(arg.split('=')[1]);
    }
  }

  if (!version) {
    console.error(
      'Error: Please supply a version via --version <value> or the VERSION env variable.'
    );
    process.exit(1);
  }

  return { version, bucket, outputPath };
};

const bucketUrlFor = (bucket, id, version) => {
  const base = bucket.endsWith('/') ? bucket.slice(0, -1) : bucket;
  return `${base}/plugins/${id}/${version}/bundle.tgz`;
};

const main = async () => {
  const { version, bucket, outputPath } = parseArgs();

  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  const pluginDirs = entries.filter((entry) => entry.isDirectory());

  if (pluginDirs.length === 0) {
    console.error('No plugin directories found under ./plugins.');
    process.exit(1);
  }

  const plugins = [];

  for (const dirent of pluginDirs) {
    const pluginPath = path.join(pluginsRoot, dirent.name);
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    if (!manifest.id) {
      throw new Error(`plugin.json in ${dirent.name} is missing an "id".`);
    }

    const tarballPath = path.join(outRoot, `${manifest.id}-${version}.tgz`);
    const hashPath = path.join(outRoot, `${manifest.id}-${version}.sha256`);

    try {
      await fs.access(tarballPath);
      await fs.access(hashPath);
    } catch {
      throw new Error(
        `Missing bundle or hash for ${manifest.id}. Did you run "npm run bundle:create -- --version ${version}"?`
      );
    }

    const integritySha256 = (await fs.readFile(hashPath, 'utf8')).trim();

    plugins.push({
      id: manifest.id,
      versions: [
        {
          version,
          tarballUrl: bucketUrlFor(bucket, manifest.id, version),
          integritySha256,
        },
      ],
    });
  }

  const registry = {
    updatedAt: new Date().toISOString(),
    plugins,
  };

  await fs.writeFile(
    outputPath,
    `${JSON.stringify(registry, null, 2)}\n`,
    'utf8'
  );

  console.log(`registry.json written to ${outputPath}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

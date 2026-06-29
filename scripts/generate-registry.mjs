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
  let bucket = process.env.BUCKET || 'gs://mf-plugins-prod';
  let outputPath = path.join(repoRoot, 'registry.json');
  let sourceRepoUrl = process.env.SOURCE_REPO_URL || (
    process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`
      : ''
  );
  let sourceCommit = process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || '';
  let releaseNotesUrl = process.env.RELEASE_NOTES_URL || '';
  let minServerVersion = process.env.MIN_SERVER_VERSION || '';
  let apiVersion = process.env.PLUGIN_API_VERSION || '';
  const plugins = new Set();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--bucket' && args[i + 1]) {
      bucket = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--bucket=')) {
      bucket = arg.split('=')[1];
    } else if (arg === '--output' && args[i + 1]) {
      outputPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      outputPath = path.resolve(arg.split('=')[1]);
    } else if (arg === '--plugin' && args[i + 1]) {
      plugins.add(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--plugin=')) {
      plugins.add(arg.split('=')[1]);
    } else if (arg === '--source-repo-url' && args[i + 1]) {
      sourceRepoUrl = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--source-repo-url=')) {
      sourceRepoUrl = arg.split('=')[1];
    } else if (arg === '--source-commit' && args[i + 1]) {
      sourceCommit = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--source-commit=')) {
      sourceCommit = arg.split('=')[1];
    } else if (arg === '--release-notes-url' && args[i + 1]) {
      releaseNotesUrl = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--release-notes-url=')) {
      releaseNotesUrl = arg.split('=')[1];
    } else if (arg === '--min-server-version' && args[i + 1]) {
      minServerVersion = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--min-server-version=')) {
      minServerVersion = arg.split('=')[1];
    } else if (arg === '--api-version' && args[i + 1]) {
      apiVersion = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--api-version=')) {
      apiVersion = arg.split('=')[1];
    }
  }

  return {
    bucket,
    outputPath,
    plugins: Array.from(plugins),
    sourceRepoUrl,
    sourceCommit,
    releaseNotesUrl,
    minServerVersion,
    apiVersion,
  };
};

const bucketUrlFor = (bucket, id, version) => {
  const base = bucket.endsWith('/') ? bucket.slice(0, -1) : bucket;
  return `${base}/plugins/${id}/${version}/bundle.tgz`;
};

const defaultReleaseNotesUrl = (repoUrl, id, version) => {
  if (!repoUrl) return '';
  const base = repoUrl.endsWith('/') ? repoUrl.slice(0, -1) : repoUrl;
  return `${base}/releases/tag/${id}@${version}`;
};

const optionalString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const releaseMetadataFor = (manifest, args) => {
  const source = manifest.source || {};
  const compatibility = manifest.compatibility || {};
  const repoUrl = optionalString(args.sourceRepoUrl, source.repoUrl);
  const version = {
    releaseNotesUrl: optionalString(
      args.releaseNotesUrl,
      source.releaseNotesUrl,
      defaultReleaseNotesUrl(repoUrl, manifest.id, manifest.version)
    ),
    sourceRepoUrl: repoUrl,
    sourceCommit: optionalString(args.sourceCommit, source.commit),
    minServerVersion: optionalString(args.minServerVersion, compatibility.minServerVersion),
    apiVersion: optionalString(args.apiVersion, compatibility.apiVersion),
  };

  return Object.fromEntries(
    Object.entries(version).filter(([, value]) => Boolean(value))
  );
};

const main = async () => {
  const args = parseArgs();
  const { bucket, outputPath, plugins } = args;

  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  let pluginDirs = entries.filter((entry) => entry.isDirectory());
  if (plugins.length > 0) {
    pluginDirs = pluginDirs.filter((entry) => plugins.includes(entry.name));
  }

  if (pluginDirs.length === 0) {
    console.error('No plugin directories found under ./plugins.');
    process.exit(1);
  }

  const pluginEntries = [];

  for (const dirent of pluginDirs) {
    const pluginPath = path.join(pluginsRoot, dirent.name);
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    if (!manifest.id) {
      throw new Error(`plugin.json in ${dirent.name} is missing an "id".`);
    }

    if (!manifest.version) {
      throw new Error(`plugin.json in ${dirent.name} is missing a "version".`);
    }

    const pluginVersion = manifest.version;
    const tarballPath = path.join(outRoot, `${manifest.id}-${pluginVersion}.tgz`);
    const hashPath = path.join(outRoot, `${manifest.id}-${pluginVersion}.sha256`);

    try {
      await fs.access(tarballPath);
      await fs.access(hashPath);
    } catch {
      throw new Error(
        `Missing bundle or hash for ${manifest.id}. Did you run "npm run bundle:create -- --plugin ${manifest.id}"?`
      );
    }

    const integritySha256 = (await fs.readFile(hashPath, 'utf8')).trim();

    pluginEntries.push({
      id: manifest.id,
      versions: [
        {
          version: pluginVersion,
          tarballUrl: bucketUrlFor(bucket, manifest.id, pluginVersion),
          integritySha256,
          ...releaseMetadataFor(manifest, args),
        },
      ],
    });
  }

  let existingRegistry = { updatedAt: '', plugins: [] };
  try {
    const existingRaw = await fs.readFile(outputPath, 'utf8');
    existingRegistry = JSON.parse(existingRaw);
  } catch {
    // OK if registry does not exist yet
  }

  const merged = new Map();
  for (const entry of existingRegistry.plugins || []) {
    if (entry?.id) {
      merged.set(entry.id, { id: entry.id, versions: entry.versions || [] });
    }
  }

  for (const entry of pluginEntries) {
    const current = merged.get(entry.id) || { id: entry.id, versions: [] };
    const nextVersion = entry.versions[0];
    const existingIndex = current.versions.findIndex(
      (item) => item.version === nextVersion.version
    );
    if (existingIndex >= 0) {
      current.versions[existingIndex] = nextVersion;
    } else {
      current.versions.push(nextVersion);
    }
    merged.set(entry.id, current);
  }

  const registry = {
    updatedAt: new Date().toISOString(),
    plugins: Array.from(merged.values()),
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

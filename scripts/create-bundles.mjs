#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const pluginsRoot = path.join(repoRoot, 'plugins');
const outRoot = path.join(repoRoot, 'out');

const parseArgs = () => {
  const args = process.argv.slice(2);
  let version = process.env.VERSION || '';
  const plugins = new Set();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version' && args[i + 1]) {
      version = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--version=')) {
      version = arg.split('=')[1];
    } else if (arg === '--plugin' && args[i + 1]) {
      plugins.add(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--plugin=')) {
      plugins.add(arg.split('=')[1]);
    }
  }

  return { version, plugins: Array.from(plugins) };
};

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const copyRecursive = async (src, dest) => {
  await fs.cp(src, dest, { recursive: true });
};

const runTar = (stageDir, tarballPath) => {
  // Check if GNU tar (gtar) is available, otherwise use system tar
  const tarCmd = spawnSync('which', ['gtar'], { encoding: 'utf8' });
  const useGnuTar = tarCmd.status === 0;

  let args;
  if (useGnuTar) {
    // GNU tar with reproducible build options
    args = [
      '--sort=name',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--mtime=@0',
      '-czf',
      tarballPath,
      '-C',
      stageDir,
      '.',
    ];
  } else {
    // macOS/BSD tar - simpler options
    args = [
      '-czf',
      tarballPath,
      '-C',
      stageDir,
      '.',
    ];
  }

  const result = spawnSync(useGnuTar ? 'gtar' : 'tar', args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`tar exited with status ${result.status}`);
  }
};

const sha256File = async (filePath) => {
  const hash = crypto.createHash('sha256');
  const file = await fs.readFile(filePath);
  hash.update(file);
  return hash.digest('hex');
};

const main = async () => {
  const { version, plugins } = parseArgs();

  await ensureDir(outRoot);

  const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
  let pluginDirs = entries.filter((entry) => entry.isDirectory());
  if (plugins.length > 0) {
    pluginDirs = pluginDirs.filter((entry) => plugins.includes(entry.name));
  }

  if (pluginDirs.length === 0) {
    console.error('No plugin directories found under ./plugins.');
    process.exit(1);
  }

  console.log(
    `Creating bundles${version ? ` for version ${version}` : ''}…`
  );

  for (const dirent of pluginDirs) {
    const pluginPath = path.join(pluginsRoot, dirent.name);
    const manifestPath = path.join(pluginPath, 'plugin.json');
    const distPath = path.join(pluginPath, 'dist');

    const manifestRaw = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    if (!manifest.id) {
      throw new Error(`plugin.json in ${dirent.name} is missing an "id".`);
    }

    if (!manifest.version) {
      throw new Error(`plugin.json in ${dirent.name} is missing a "version".`);
    }

    if (version && manifest.version !== version) {
      throw new Error(
        `Version mismatch for ${manifest.id}: manifest=${manifest.version}, requested=${version}.`
      );
    }

    const pluginVersion = manifest.version;

    try {
      await fs.access(distPath);
    } catch {
      throw new Error(
        `Missing dist directory for ${manifest.id}. Build the plugin before bundling.`
      );
    }

    const stageDir = path.join(outRoot, `${manifest.id}-${pluginVersion}`);
    await fs.rm(stageDir, { recursive: true, force: true });
    await ensureDir(stageDir);

    // Copy manifest and dist into staging directory
    await fs.copyFile(manifestPath, path.join(stageDir, 'plugin.json'));
    await copyRecursive(distPath, path.join(stageDir, 'dist'));

    const tarballPath = path.join(outRoot, `${manifest.id}-${pluginVersion}.tgz`);

    console.log(`• Packaging ${manifest.id} → ${tarballPath}`);
    runTar(stageDir, tarballPath);

    const digest = await sha256File(tarballPath);
    await fs.writeFile(
      path.join(outRoot, `${manifest.id}-${pluginVersion}.sha256`),
      `${digest}\n`,
      'utf8'
    );

    // Clean up staging directory
    await fs.rm(stageDir, { recursive: true, force: true });
  }

  console.log('Bundles created in ./out. SHA256 sums written alongside each archive.');
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

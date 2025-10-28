#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ROOT = process.cwd();
const PLUGINS_DIR = path.join(PROJECT_ROOT, 'plugins');

const REQUIRED_ROOT_FIELDS = [
  'id',
  'name',
  'version',
  'description',
  'entry',
  'events',
  'secrets'
];

const fail = (message) => {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
};

const loadJson = async (filePath) => {
  const raw = await readFile(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${(error && error.message) || error}`);
  }
};

const assertArray = (value, message) => {
  if (!Array.isArray(value) || value.length === 0) {
    fail(message);
  }
};

const validateMetadata = (pluginId, manifest) => {
  const metadata = manifest.metadata;
  if (!metadata) {
    fail(`${pluginId}: missing "metadata" block`);
    return;
  }

  if (!metadata.author || !metadata.author.name) {
    fail(`${pluginId}: metadata.author.name is required`);
  }

  if (!metadata.homepage) {
    fail(`${pluginId}: metadata.homepage is required`);
  }

  if (!manifest.documentation || !manifest.documentation.readmePath) {
    fail(`${pluginId}: documentation.readmePath is required`);
  }
};

const validateUI = (pluginId, manifest) => {
  const ui = manifest.ui;
  if (!ui || !ui.forms) {
    fail(`${pluginId}: ui.forms is required`);
    return;
  }

  if (!('server' in ui.forms) || !('channel' in ui.forms)) {
    fail(`${pluginId}: ui.forms.server and ui.forms.channel must be present (use empty arrays if not applicable)`);
  }
};

const validateReadme = async (pluginId, pluginDir, manifest) => {
  const readmePath = manifest?.documentation?.readmePath;
  if (!readmePath) {
    return;
  }

  const absolute = path.isAbsolute(readmePath)
    ? readmePath
    : path.join(pluginDir, readmePath);

  try {
    await stat(absolute);
  } catch {
    fail(`${pluginId}: README path ${readmePath} does not exist`);
    return;
  }

  if (!absolute.startsWith(pluginDir)) {
    fail(`${pluginId}: README path must live inside the plugin directory`);
  }
};

const validateManifest = async (pluginDir) => {
  const pluginId = path.basename(pluginDir);
  const manifestPath = path.join(pluginDir, 'plugin.json');
  const manifest = await loadJson(manifestPath);

  for (const key of REQUIRED_ROOT_FIELDS) {
    if (!(key in manifest)) {
      fail(`${pluginId}: missing required field "${key}"`);
    }
  }

  assertArray(manifest.events, `${pluginId}: events must be a non-empty array`);
  if (!Array.isArray(manifest.secrets)) {
    fail(`${pluginId}: secrets must be an array (use [] when no secrets are required)`);
  }

  validateMetadata(pluginId, manifest);
  validateUI(pluginId, manifest);
  await validateReadme(pluginId, pluginDir, manifest);
};

const main = async () => {
  const pluginFolders = await readdir(PLUGINS_DIR);
  const checks = pluginFolders.map((folder) => validateManifest(path.join(PLUGINS_DIR, folder)));
  await Promise.all(checks);

  if (process.exitCode) {
    console.error('\nManifest validation failed.');
    process.exit(process.exitCode);
  } else {
    console.log('✅ All plugin manifests passed validation.');
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

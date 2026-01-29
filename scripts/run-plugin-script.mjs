#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const pluginsRoot = path.join(repoRoot, 'plugins');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const command = args[0];
  let pluginId = null;

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--plugin' && args[i + 1]) {
      pluginId = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--plugin=')) {
      pluginId = arg.split('=')[1];
    }
  }

  return { command, pluginId };
};

const main = () => {
  const { command, pluginId } = parseArgs();

  if (!command || !['install', 'build'].includes(command)) {
    console.error('Usage: node scripts/run-plugin-script.mjs <install|build> --plugin <id>');
    process.exit(1);
  }

  if (!pluginId) {
    console.error('Missing --plugin <id>');
    process.exit(1);
  }

  const pluginPath = path.join(pluginsRoot, pluginId);

  const result = spawnSync(
    'pnpm',
    ['-C', pluginPath, command],
    { stdio: 'inherit' }
  );

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 0);
};

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}

#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourcesPath = path.join(repoRoot, 'registry-sources.json');

const parseArgs = () => {
  const args = process.argv.slice(2);
  let outputPath = path.join(repoRoot, 'registry.json');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--output' && args[i + 1]) {
      outputPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      outputPath = path.resolve(arg.split('=')[1]);
    }
  }

  return { outputPath };
};

const normalizeGitHubRepoUrl = (url) => {
  const parsed = new URL(url);
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parsed.hostname !== 'github.com' || parts.length < 2) {
    throw new Error(`Expected a GitHub repository URL, got ${url}`);
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  return `https://github.com/${owner}/${repo}`;
};

const githubApiHeaders = () => {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return token
    ? {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28'
      }
    : {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28'
      };
};

const fetchGitHubJson = async (url) => {
  const response = await fetch(url, { headers: githubApiHeaders() });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
};

const fetchGitHubText = async (url) => {
  const response = await fetch(url, { headers: githubApiHeaders() });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
};

const compareVersions = (a, b) => {
  const normalize = (version) => version.replace(/^v/i, '');
  const parse = (version) => {
    const [core, prerelease] = normalize(version).split('-', 2);
    const parts = core.split('.').map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
    while (parts.length < 3) parts.push(0);
    return { parts, prerelease: prerelease || '' };
  };

  const parsedA = parse(a);
  const parsedB = parse(b);

  for (let i = 0; i < Math.max(parsedA.parts.length, parsedB.parts.length); i += 1) {
    const aPart = parsedA.parts[i] || 0;
    const bPart = parsedB.parts[i] || 0;
    if (aPart !== bPart) return aPart - bPart;
  }

  if (parsedA.prerelease && !parsedB.prerelease) return -1;
  if (!parsedA.prerelease && parsedB.prerelease) return 1;
  return parsedA.prerelease.localeCompare(parsedB.prerelease);
};

const sortVersionsDescending = (versions) =>
  [...versions].sort((a, b) => compareVersions(b.version, a.version));

export const releaseTarballUrlFor = (repoUrl, id, version) => {
  if (!repoUrl) return '';
  const base = repoUrl.endsWith('/') ? repoUrl.slice(0, -1) : repoUrl;
  return `${base}/releases/download/v${version}/${id}-${version}.tgz`;
};

export const defaultReleaseNotesUrl = (repoUrl, version) => {
  if (!repoUrl) return '';
  const base = repoUrl.endsWith('/') ? repoUrl.slice(0, -1) : repoUrl;
  return `${base}/releases/tag/v${version}`;
};

const optionalString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const loadRegistrySources = async () => {
  const raw = await fs.readFile(sourcesPath, 'utf8');
  const sources = JSON.parse(raw);
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('registry-sources.json must contain at least one source');
  }
  return sources;
};

const buildRegistryVersionFromRelease = async (source, release) => {
  const assets = release.assets || [];
  const manifestAsset = assets.find((asset) => asset.name === 'plugin.json' && asset.browser_download_url);
  const tarballAsset = assets.find((asset) => asset.name?.endsWith('.tgz') && asset.browser_download_url);
  const checksumAsset = assets.find((asset) => asset.name?.endsWith('.tgz.sha256') && asset.browser_download_url);

  if (!manifestAsset?.browser_download_url || !tarballAsset?.browser_download_url || !checksumAsset?.browser_download_url) {
    return null;
  }

  const manifest = JSON.parse(await fetchGitHubText(manifestAsset.browser_download_url));
  if (manifest?.id !== source.id || !manifest?.version) {
    return null;
  }

  const integritySha256 = (await fetchGitHubText(checksumAsset.browser_download_url)).split(/\s+/)[0]?.trim();
  if (!integritySha256) {
    return null;
  }

  const repoUrl = normalizeGitHubRepoUrl(source.repoUrl);
  const version = manifest.version;

  return {
    version,
    tarballUrl: tarballAsset.browser_download_url,
    integritySha256,
    releaseNotesUrl: release.html_url || manifest.source?.releaseNotesUrl || defaultReleaseNotesUrl(repoUrl, version),
    sourceRepoUrl: manifest.source?.repoUrl || repoUrl,
    sourceCommit: manifest.source?.commit || release.target_commitish || '',
    minServerVersion: optionalString(manifest.compatibility?.minServerVersion),
    apiVersion: optionalString(manifest.compatibility?.apiVersion),
  };
};

export const buildRegistryPluginFromSource = async (source) => {
  const repoUrl = normalizeGitHubRepoUrl(source.repoUrl);
  const parsed = new URL(repoUrl);
  const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
  const releasesUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`;
  const releases = await fetchGitHubJson(releasesUrl);

  const versions = [];
  for (const release of releases || []) {
    const version = await buildRegistryVersionFromRelease(source, release);
    if (version) {
      versions.push(version);
    }
  }

  return {
    id: source.id,
    versions: sortVersionsDescending(versions)
  };
};

const main = async () => {
  const args = parseArgs();
  const sources = await loadRegistrySources();

  const registry = {
    updatedAt: new Date().toISOString(),
    plugins: []
  };

  for (const source of sources) {
    registry.plugins.push(await buildRegistryPluginFromSource(source));
  }

  await fs.writeFile(args.outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  console.log(`registry.json written to ${args.outputPath}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

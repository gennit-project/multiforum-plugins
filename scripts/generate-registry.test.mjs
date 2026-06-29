import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { buildRegistryPluginFromSource, releaseTarballUrlFor, defaultReleaseNotesUrl } from './generate-registry.mjs';

const originalFetch = globalThis.fetch;

const installFetchMock = (responses) => {
  globalThis.fetch = (async (url) => {
    const key = String(url);
    if (!(key in responses)) {
      throw new Error(`Unexpected fetch: ${key}`);
    }

    const response = responses[key];
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => {
        if (response.json !== undefined) return response.json;
        return JSON.parse(response.text);
      },
      text: async () => {
        if (response.text !== undefined) return response.text;
        return JSON.stringify(response.json);
      }
    };
  });
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('release URL helpers build GitHub release asset URLs', () => {
  assert.equal(
    releaseTarballUrlFor(
      'https://github.com/gennit-project/multiforum-plugin-hello-world',
      'hello-world',
      '0.2.2'
    ),
    'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/hello-world-0.2.2.tgz'
  );

  assert.equal(
    defaultReleaseNotesUrl('https://github.com/gennit-project/multiforum-plugin-hello-world', '0.2.2'),
    'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/tag/v0.2.2'
  );
});

test('buildRegistryPluginFromSource synthesizes versions from repo releases', async () => {
  installFetchMock({
    'https://api.github.com/repos/gennit-project/multiforum-plugin-hello-world/releases?per_page=100': {
      json: [
        {
          tag_name: 'v0.2.2',
          html_url: 'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/tag/v0.2.2',
          target_commitish: 'main',
          assets: [
            {
              name: 'plugin.json',
              browser_download_url: 'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/plugin.json'
            },
            {
              name: 'hello-world-0.2.2.tgz',
              browser_download_url: 'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/hello-world-0.2.2.tgz'
            },
            {
              name: 'hello-world-0.2.2.tgz.sha256',
              browser_download_url: 'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/hello-world-0.2.2.tgz.sha256'
            }
          ]
        }
      ]
    },
    'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/plugin.json': {
      json: {
        id: 'hello-world',
        version: '0.2.2',
        source: {
          repoUrl: 'https://github.com/gennit-project/multiforum-plugin-hello-world'
        },
        compatibility: {
          minServerVersion: '1.0.0',
          apiVersion: '1'
        }
      }
    },
    'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/hello-world-0.2.2.tgz.sha256': {
      text: 'abc123  hello-world-0.2.2.tgz\n'
    }
  });

  const plugin = await buildRegistryPluginFromSource({
    id: 'hello-world',
    repoUrl: 'https://github.com/gennit-project/multiforum-plugin-hello-world'
  });

  assert.equal(plugin.id, 'hello-world');
  assert.equal(plugin.versions[0].version, '0.2.2');
  assert.equal(plugin.versions[0].tarballUrl, 'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/hello-world-0.2.2.tgz');
  assert.equal(plugin.versions[0].integritySha256, 'abc123');
  assert.equal(plugin.versions[0].releaseNotesUrl, 'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/tag/v0.2.2');
  assert.equal(plugin.versions[0].sourceRepoUrl, 'https://github.com/gennit-project/multiforum-plugin-hello-world');
});

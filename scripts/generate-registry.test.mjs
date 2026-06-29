import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultReleaseNotesUrl,
  releaseMetadataFor,
  releaseTarballUrlFor,
} from './generate-registry.mjs';

test('release tarball URLs resolve to GitHub release assets', () => {
  assert.equal(
    releaseTarballUrlFor(
      'https://github.com/gennit-project/multiforum-plugin-hello-world',
      'hello-world',
      '0.2.2'
    ),
    'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/download/v0.2.2/hello-world-0.2.2.tgz'
  );
});

test('release notes URLs default to the tagged GitHub release', () => {
  assert.equal(
    defaultReleaseNotesUrl(
      'https://github.com/gennit-project/multiforum-plugin-hello-world',
      '0.2.2'
    ),
    'https://github.com/gennit-project/multiforum-plugin-hello-world/releases/tag/v0.2.2'
  );
});

test('release metadata prefers manifest source fields', () => {
  const metadata = releaseMetadataFor(
    {
      version: '0.2.2',
      source: {
        repoUrl: 'https://github.com/gennit-project/multiforum-plugin-hello-world',
        releaseNotesUrl: 'https://example.com/releases/hello-world',
        commit: 'abc123',
      },
      compatibility: {
        minServerVersion: '1.2.3',
        apiVersion: '2',
      },
    },
    {}
  );

  assert.deepEqual(metadata, {
    releaseNotesUrl: 'https://example.com/releases/hello-world',
    sourceRepoUrl: 'https://github.com/gennit-project/multiforum-plugin-hello-world',
    sourceCommit: 'abc123',
    minServerVersion: '1.2.3',
    apiVersion: '2',
  });
});

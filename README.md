# Multiforum Plugin Registry Sources

This repository now tracks the source list for the standalone Multiforum plugin repos.

The plugin implementations live in their own repositories:

- `multiforum-plugin-auto-moderation-bot`
- `multiforum-plugin-beta-reader-bot`
- `multiforum-plugin-chatgpt-bot-profiles`
- `multiforum-plugin-hello-world`
- `multiforum-plugin-security-attachment-scan`

`scripts/generate-registry.mjs` reads `registry-sources.json`, fetches each repo's GitHub Releases, and writes `registry.json`.

To add a new plugin:

1. Create the standalone plugin repo.
2. Add its `id` and `repoUrl` to `registry-sources.json`.
3. Run `npm run registry:generate`.

The old in-repo plugin folders have been removed. This repository is now only the registry source index and generator.

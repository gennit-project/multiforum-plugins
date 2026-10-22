# Multiforum Plugin Registry Sources

This repository tracks the source list for the standalone Multiforum plugin repos
and generates the registry files that servers read.

The plugin implementations live in their own repositories:

- `multiforum-plugin-auto-moderation-bot`
- `multiforum-plugin-beta-reader-bot`
- `multiforum-plugin-chatgpt-bot-profiles`
- `multiforum-plugin-hello-world`
- `multiforum-plugin-security-attachment-scan`

`scripts/generate-registry.mjs` reads `registry-sources.json`, fetches each repo's
GitHub Releases, and writes one registry file per registry group.

## Registry groups

Each source may set a `registry` id that decides which registry file its plugin is
published to (default: `default`):

| `registry` id | Output file                  | Published GCS object                        |
| ------------- | ---------------------------- | ------------------------------------------- |
| `default`     | `registry.json`              | `gs://mf-plugins-prod/registry.json`              |
| `experimental`| `registry-experimental.json` | `gs://mf-plugins-prod/registry-experimental.json` |

A server opts into a registry by adding its URL to the server config's
`pluginRegistries` list (Admin → Settings → Plugins → Registries). The backend
merges every configured registry, so a server can read the default registry, the
experimental one, or both.

**This grouping is only a publishing convenience** — a way to keep less-proven
plugins on a separate URL. It is not a release channel: the generated registry
files contain no group marker, and the app does **not** infer anything (such as
"experimental") from which registry a plugin came from. Whether a specific plugin
version is experimental is tracked per version inside the app itself.

## Generating

```bash
npm run registry:generate                 # writes every registry file referenced by the sources
npm run registry:generate -- --registry experimental   # just one registry
npm run registry:generate -- --output /tmp/registry.json  # default registry to an explicit path
```

## Adding or moving a plugin

1. Create the standalone plugin repo (if new).
2. Add its `id` and `repoUrl` to `registry-sources.json`.
3. Set `registry` to `experimental` to publish it to the experimental registry,
   or leave it unset / `default` for the default registry.
4. Run `npm run registry:generate` (or let the `Publish Registry` workflow do it).

To move an existing plugin (e.g. the beta reader bot) to the experimental
registry, just change its `registry` value and republish.

The generated `registry.json` / `registry-experimental.json` files are build
artifacts (git-ignored). The `Publish Registry` GitHub Actions workflow
regenerates them and uploads both to the GCS bucket that production reads.

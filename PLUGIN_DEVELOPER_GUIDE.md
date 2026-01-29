# Multiforum Plugins — Developer Guide

This guide targets plugin authors integrating Multiforum with third‑party APIs.

## Plugin Anatomy

Each plugin lives under `plugins/<id>/` and includes:
- `plugin.json` (manifest; version source of truth)
- `src/` (TypeScript source)
- `dist/` (compiled JS referenced by the manifest)

## Manifest Essentials

Minimal required fields:
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "What it does",
  "entry": "dist/index.js",
  "events": ["downloadableFile.created"],
  "secrets": []
}
```

Important rules:
- `version` is the source of truth for releases.
- The tarball path and registry version must match `plugin.json.version`.

## Build & Test

```bash
cd plugins/my-plugin
npm install
npm run build
```

## Release (Plugin‑Scoped)

1. Bump `plugin.json.version`.
2. Build the plugin.
3. Bundle just this plugin:
   ```bash
   npm run bundle:create -- --plugin my-plugin
   ```
4. Update registry (merge):
   ```bash
   npm run registry:generate -- --plugin my-plugin --output registry.json
   ```
5. Upload tarball + hash + registry to your bucket.
6. Tag a release: `my-plugin@0.1.1`.

## Multiple Registries

You can publish your plugin to any registry URL. Servers may point to multiple registries; they are merged on the server side.

## Secrets & Settings

Use `secrets` in `plugin.json` for required API keys and `settingsDefaults` for configuration defaults. The admin UI will render forms based on `ui.forms`.

## Best Practices

- Validate secrets in a static `validateSecrets()` method.
- Fail fast with clear errors if required secrets are missing.
- Keep plugin behavior deterministic and idempotent for pipeline retries.


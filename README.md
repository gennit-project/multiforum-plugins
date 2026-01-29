
# Multiforum Official Plugins

This repository contains demo plugins for the Multiforum platform.

Docs are split by audience:
- Server admins: `SERVER_ADMIN_GUIDE.md`
- Plugin developers: `PLUGIN_DEVELOPER_GUIDE.md`

Plugins in this repo demonstrate how to extend Multiforum using **hooks** that run when a comment or discussion is created.

At this stage, the repo contains two example plugins:

- **Security: Attachment Scan**  
  A server-scoped plugin that scans uploaded attachments against the [VirusTotal API](https://www.virustotal.com/).  
  Requires a secret (`VIRUS_TOTAL_API_KEY`) to be configured by the site admin.

- **Hello World**  
  A simple channel-scoped plugin that proves execution works at the forum level.  
  When enabled, it logs a message each time a discussion is created.

---

## Repository Layout

- Each plugin has its own folder under `plugins/`.
- `plugin.json` declares the plugin manifest (id, name, version, entry file, required events, secrets).
- `src/` contains TypeScript source.
- `dist/` contains compiled JavaScript for execution (the entry point listed in `plugin.json`).

---

## Plugin Manifest Example

```json
{
  "id": "security-attachment-scan",
  "name": "Security: Attachment Scan",
  "version": "0.1.0",
  "entry": "dist/index.js",
  "events": ["comment.created", "discussion.created"],
  "secrets": {
    "VIRUS_TOTAL_API_KEY": { "scope": "server", "required": true }
  }
}
````

---

## Development

### Prerequisites

- Node.js ≥ 18
- npm / pnpm / yarn
- TypeScript

### Build a plugin

From the repo root:

```bash
# Security Scan
cd plugins/security-attachment-scan
npm install
npm run build

# Hello World
cd ../hello-world
npm install
npm run build
```

This generates `dist/index.js` referenced by each manifest.

### Manifest validation

```bash
npm run lint:manifests
```

Run the validator before committing to ensure each manifest declares metadata, documentation paths, and UI configuration used by the admin screens.

### Local packaging helpers

- `npm run bundle:create -- --plugin <id>` bundles a single plugin using its manifest version.
- `npm run registry:generate -- --plugin <id>` merges that plugin version into `registry.json`.

### Publishing checklist (plugin-scoped releases)

- Bump the `version` inside the plugin’s `plugin.json` **before** building.
- Build only the plugin you are releasing so the tarball bundles the updated manifest.
- After uploading the bundle, sanity-check the embedded manifest:
  ```bash
  gsutil cat gs://<bucket>/plugins/<id>/<version>/plugin.json
  ```
  The manifest version is the source of truth. The `version` field must match the `<version>` directory and the version entry in `registry.json`. If they differ (for example, the manifest still says `0.2.0` but the registry lists `0.2.1`), installs fail and `refreshPlugins` creates mismatched version records.
- Update `registry.json` by **merging** the new version into existing entries (do not overwrite other plugins or older versions).

## How Multiforum Uses These Plugins

1. A Multiforum **admin points the server** at a plugin **registry** (JSON in GCS).
2. Plugins from this repo appear under **Allowed Plugins** in the server’s **Plugin Library** UI.
3. Admin can **enable** server-scoped plugins and **enter secrets** (e.g., VirusTotal key).
4. Admin can **allow channel-scoped** plugins; channel owners can then enable them per forum.
5. When content is posted:

   * Server-enabled plugins run (e.g., Attachment Scan).
   * Channel-enabled plugins run (e.g., Hello World).
6. Results are visible in a Pipelines panel: each check (plugin) shows success/failure and logs.

---

## CI/CD: GitHub → GCS → Multiforum

This repo publishes **deterministic tarballs** per plugin+version to **Google Cloud Storage (GCS)** using **plugin-scoped releases**. Multiforum reads a `registry.json` in the bucket to list what’s available.
This documentation assumes the publishing scripts/CI have been updated to support per-plugin builds and registry merging.

### GCS layout (private bucket)

```

gs://mf-plugins-prod/
  registry.json
  plugins/
    security-attachment-scan/
      0.1.0/
        bundle.tgz
        bundle.sha256
        plugin.json        # convenience copy
    hello-world/
      0.1.0/
        bundle.tgz
        bundle.sha256
        plugin.json

```

> You can also store `plugins/<id>/latest.json` → `{ "version": "0.1.0" }` as a convenience (optional).

### Tarball contents

Each **bundle.tgz** includes only what the worker needs:

```

plugin.json
dist/index.js

# optionally: dist/*.map, README.md

```

We make tarballs **deterministic** so their SHA256 hash is stable (sort entries, zero timestamps, numeric owners).

### Versioning convention (plugin-scoped)

* The **plugin manifest version** (`plugin.json.version`) is the source of truth.
* Release a single plugin at a time:
  - Recommended tag format: `<plugin-id>@<version>` (e.g. `hello-world@0.2.2`).
  - CI validates that the tag version matches `plugin.json.version`.
* CI builds only the tagged plugin, uploads its tarball to:
  `gs://<bucket>/plugins/<id>/<version>/bundle.tgz`
* CI then **merges** the new version into `registry.json` instead of overwriting it.

### Access control

* Keep the bucket **private**.
* CI authenticates using **Workload Identity Federation** (preferred) or a service account key.
* Multiforum API/Worker run with a **GCP service account** that has `storage.objects.get` (and optionally `list` to read the registry).

**Secrets required in repo settings:**

* `WIF_PROVIDER` – Workload Identity Federation provider resource name.
* `GCP_SA_EMAIL` – GCP service account email that can upload to the bucket.

---

## Registry Format

The `registry.json` object uploaded by CI looks like:

```json
{
  "updatedAt": "2025-08-26T21:22:30-07:00",
  "plugins": [
    {
      "id": "security-attachment-scan",
      "versions": [
        {
          "version": "0.2.1",
          "tarballUrl": "gs://mf-plugins-prod/plugins/security-attachment-scan/0.2.1/bundle.tgz",
          "integritySha256": "e3b0c44298fc1c149afbf4c8996fb924..."
        }
      ]
    },
    {
      "id": "hello-world",
      "versions": [
        {
          "version": "0.2.2",
          "tarballUrl": "gs://mf-plugins-prod/plugins/hello-world/0.2.2/bundle.tgz",
          "integritySha256": "ab12cd34ef56..."
        }
      ]
    }
  ]
}
```

Multiforum uses this to list plugins and install a chosen `id@version`. During install, the server downloads the tarball from GCS, **verifies** the SHA256, and records the GCS URL + hash in its database. Workers fetch the tarball by `gs://` path at runtime, verify again, extract, and run `dist/index.js`.

Notes:
- Registries should preserve older versions when new ones are published.
- Multiple registries are supported; each registry can host any subset of plugins.

---

## Local / Manual Publish (without CI)

If you want to test end-to-end before wiring CI, publish **one plugin at a time**:

```bash
# 1. Build the plugin (dist outputs will be packaged)
cd plugins/hello-world
npm install
npm run build

# 2. Create deterministic bundle for this plugin's manifest version
# (example assumes plugin.json.version = 0.2.2)
cd ../..
npm run bundle:create -- --plugin hello-world

# 3. Merge registry.json (override bucket if needed)
npm run registry:generate -- --plugin hello-world --bucket gs://mf-plugins-prod --output registry.json

# 4. Upload bundle + hash + merged registry
BUCKET=mf-plugins-prod
VERSION=0.2.2
gsutil cp "out/hello-world-${VERSION}.tgz" "gs://${BUCKET}/plugins/hello-world/${VERSION}/bundle.tgz"
gsutil cp "out/hello-world-${VERSION}.sha256" "gs://${BUCKET}/plugins/hello-world/${VERSION}/bundle.sha256"
gsutil cp registry.json "gs://${BUCKET}/registry.json"
```

---

## Writing Your Own Plugins

1. Create `plugins/<your-plugin>/`.
2. Add a `plugin.json` with `id`, `name`, `version`, `entry`, `events`.
3. Implement `src/index.ts` exporting a default async function:

```ts
export default async function(ctx, event) {
  ctx.log("Hello from", ctx.scope, ctx.channelId);
  // do work, e.g., ctx.storeFlag(...)
}
```

4. Compile to `dist/index.js`.
5. Commit both `plugin.json` and `dist/`.
6. Tag a release (e.g., `hello-world@0.2.2`) to trigger CI → publish to GCS.

---

## License

[MIT](LICENSE) — unless otherwise noted in individual plugin folders.

```

---

If you want, I can also drop in a tiny `scripts/validate-manifests.ts` for the repo to fail CI if a plugin is missing `dist/index.js` or the manifest is malformed.
```

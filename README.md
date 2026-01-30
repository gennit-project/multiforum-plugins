
# Multiforum Official Plugins

This repository contains demo plugins for the Multiforum platform.

Docs are split by audience:
- Server admins: `SERVER_ADMIN_GUIDE.md`
- Plugin developers: `PLUGIN_DEVELOPER_GUIDE.md`

Plugins in this repo demonstrate how to extend Multiforum using **hooks** that run when content is created or updated (comments, downloadable files, and more).

At this stage, the repo contains four example plugins:

- **Security: Attachment Scan**  
  A server-scoped plugin that scans uploaded attachments against the [VirusTotal API](https://www.virustotal.com/).  
  Requires a secret (`VIRUS_TOTAL_API_KEY`) to be configured by the site admin.

- **Hello World**  
  A simple channel-scoped plugin that proves execution works at the forum level.  
  When enabled, it logs a message each time a file attachment event is triggered.

- **ChatGPT Bot Profiles**  
  A channel-scoped plugin that responds to `/bot/<handle>` mentions in comments with configurable ChatGPT profiles.  
  Requires a secret (`OPENAI_API_KEY`) to be configured by the site admin.

- **Beta Reader Bot**  
  A channel-scoped plugin that responds to `/bot/betabot` mentions with creative writing feedback profiles.  
  Requires a secret (`OPENAI_API_KEY`) to be configured by the site admin.

---

## Repository Layout

- Each plugin has its own folder under `plugins/`.
- `plugin.json` declares the plugin manifest (id, name, version, entry file, required events, secrets).
- TypeScript source lives alongside `plugin.json` (for example, `index.ts`).
- `dist/` contains compiled JavaScript for execution (the entry point listed in `plugin.json`).

---

## Plugin Manifest Example

```json
{
  "id": "security-attachment-scan",
  "name": "Security: Attachment Scan",
  "version": "0.1.0",
  "entry": "dist/index.js",
  "events": ["comment.created"],
  "secrets": [
    { "key": "OPENAI_API_KEY", "scope": "server", "required": true }
  ]
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
# Install deps for a single plugin
npm run install:plugin -- --plugin hello-world

# Build a single plugin
npm run build:plugin -- --plugin hello-world
```

This generates `dist/index.js` referenced by each manifest.

### Plugin-scoped install/build helpers (pnpm)

These scripts run per-plugin installs/builds using pnpm workspaces:

```bash
# Install dependencies for one plugin
npm run install:plugin -- --plugin <id>

# Build one plugin
npm run build:plugin -- --plugin <id>
```

You can still build everything with `npm run build`, which runs each plugin build in sequence.

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

### Bot plugins (tagged `bot`)

Plugins with the `bot` tag create and maintain bot users when they are **enabled at the channel scope**. The backend will:

- Create bot users for every profile configured for the channel.
- Connect existing bot users to the channel if missing.
- Disconnect bot users that are no longer listed in the configured profiles.

**Required settings format (per channel or server):**

- `botName` (string): handle used to build the bot username.
- `profiles` (array) **or** `profilesJson` (string JSON array).

Each profile entry must include:
- `id` (string, required)
- `label` (string, optional) — used in display names

Example profiles JSON:

```json
[
  { "id": "general", "label": "General Assistant", "prompt": "Helpful, concise replies." }
]
```

Notes:
- If both `profiles` and `profilesJson` exist, `profiles` takes precedence.
- If `botName` is missing or empty, no bot users are created.

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
        plugin.json        # optional convenience copy of the manifest
    hello-world/
      0.1.0/
        bundle.tgz
        bundle.sha256
        plugin.json

```

> You can also store `plugins/<id>/latest.json` → `{ "version": "0.1.0" }` as a convenience (optional).
> The optional `plugin.json` file above is just a readable copy of the manifest so humans (or tooling)
> can inspect the version without unpacking the tarball.

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

## Creating a Plugin (from scratch)

1. Create a new folder under `plugins/<id>/`.
2. Add a `plugin.json` manifest with required fields (`id`, `name`, `version`, `entry`, `events`).
3. Implement `index.ts` and export a default handler.
4. Add a `package.json` with a `build` script that outputs `dist/index.js`.
5. Run `npm install` then `npm run build` inside the plugin folder.
6. Verify `dist/index.js` exists and matches the manifest `entry`.

Minimum `plugin.json` example:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "What it does",
  "entry": "dist/index.js",
  "events": ["comment.created"]
}
```

Minimum `index.ts` example:

```ts
export default async function (ctx, event) {
  ctx.log("Plugin ran for", event.type);
}
```

---

## Release / Publish Checklist

Use this for either a new plugin or a version bump:

1. Bump `plugin.json.version` (and `package.json.version` if present).
2. Build the plugin: `npm run build:plugin -- --plugin <id>`.
3. Create the bundle: `npm run bundle:create -- --plugin <id>`.
4. Merge the version into the registry: `npm run registry:generate -- --plugin <id> --bucket gs://<bucket> --output registry.json`.
5. Upload bundle + sha256 + registry to GCS.
6. (Optional) Upload the convenience `plugin.json` to `gs://<bucket>/plugins/<id>/<version>/plugin.json`.

---

## Writing Your Own Plugins

1. Create `plugins/<your-plugin>/`.
2. Add a `plugin.json` with `id`, `name`, `version`, `entry`, `events`.
3. Implement `index.ts` exporting a default class with `handleEvent`:

```ts
export default class MyPlugin {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async handleEvent(event) {
    this.ctx.log("Hello from", this.ctx.scope, this.ctx.channelId);
    // do work, e.g., this.ctx.storeFlag(...)
  }
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

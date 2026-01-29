# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains Multiforum plugins that extend the platform using **hooks** that run when content is created or updated. Plugins are packaged as deterministic tarballs and published to Google Cloud Storage via CI/CD.

## Architecture

**Plugin Structure:**
- Each plugin has its own folder under `plugins/`
- `plugin.json` declares the plugin manifest (id, name, version, entry point, events, secrets)
- TypeScript source files in the plugin directory (e.g., `index.ts`)
- `dist/` contains compiled JavaScript for execution

**Plugin Types:**
- **Server-scoped plugins**: Run for all content (e.g., security-attachment-scan)  
- **Channel-scoped plugins**: Run per forum when enabled (e.g., hello-world)

**Plugin Interface:**
Plugins export a default async function with signature:
```typescript
export default async function(ctx: HookContext, event: EventEnvelope) {
  // Plugin logic here
}
```

The `HookContext` provides:
- `ctx.log()` for logging
- `ctx.storeFlag()` for storing results/flags
- `ctx.secrets` for accessing configured secrets
- `ctx.scope` and `ctx.channelId` for context information

## Development Commands

**Build a single plugin:**
```bash
cd plugins/[plugin-name]
npm install
npm run build
```

**Build all plugins (from repo root):**
```bash
for d in plugins/*; do
  if [ -f "$d/package.json" ]; then
    (cd "$d" && npm ci && npm run build)
  fi
done
```

**Validate plugin structure:**
Ensure `dist/index.js` exists after build and matches the `entry` field in `plugin.json`.

## Publishing

**Automatic (CI/CD):**
Push a tag like `v0.1.0` to trigger the GitHub Action that builds, packages, and publishes all plugins to GCS.

**Manual publishing:**
See the "Local / Manual Publish" section in README.md for step-by-step commands to create deterministic tarballs and upload to GCS.

## Plugin Events

Current supported events:
- `comment.created`
- `downloadableFile.created`
- `downloadableFile.updated`

Event payloads contain:
- `commentId` or `discussionId` 
- `attachmentUrls` array for file-related events

## Security Considerations

- Never commit API keys or secrets to the repository
- Secrets are configured via `plugin.json` and provided at runtime through `ctx.secrets`
- Server-scoped plugins require `"scope": "server"` in the secrets configuration
- All uploaded content is scanned by enabled security plugins before being made available

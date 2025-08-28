# Multiforum Official Plugins

This repository contains demo plugins for the Multiforum platform.  
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
- `src/` contains TypeScript source code.
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

* Node.js ≥ 18
* pnpm / npm / yarn
* TypeScript

---

## How Plugins Are Used

1. **Admin sources this repo** in the Multiforum **Plugin Library** settings.
2. Plugins appear under **Allowed Plugins**.

   * Server admin can **enable server-scoped plugins** (like Attachment Scan).
   * Server admin can also **allow plugins at the channel scope**.
3. **Secrets** required by a plugin are entered in the Admin UI (e.g., VirusTotal API key).
4. When content is posted:

   * Server-enabled plugins run first (e.g., Attachment Scan).
   * Channel-enabled plugins run next (e.g., Hello World).
5. Results are visible in the Pipelines panel showing which checks succeeded or failed.

---

## Writing Your Own Plugins

1. Create a new folder under `plugins/`.
2. Add a `plugin.json` with id, name, version, entry, and events.
3. Write your hook function in `src/index.ts`:

```ts
export default async function(ctx, event) {
  ctx.log("Hello from", ctx.scope, ctx.channelId);
  // add more logic here
}
```

4. Commit both `plugin.json` and `dist/` to the repo.

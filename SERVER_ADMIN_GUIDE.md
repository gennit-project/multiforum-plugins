# Multiforum Plugins — Server Admin Guide

This guide explains how server administrators consume plugins from a registry.

## Quick Concepts

- **Registry**: A JSON catalog (often in GCS) listing plugin versions and tarball URLs.
- **Allow**: Make a plugin available to your server.
- **Install**: Choose a specific version to download and record.
- **Enable**: Activate the plugin with settings and secrets.
- **Pipeline**: The ordered execution plan for events (server or channel scope).

## Registry Requirements

Your server points to one or more registry URLs. Each registry can host any subset of plugins.

Each registry entry must match the plugin’s embedded manifest:
- `plugin.json.version` is the source of truth.
- The registry entry version and tarball path must match that version.

Example registry entry:
```json
{
  "id": "security-attachment-scan",
  "versions": [
    {
      "version": "0.2.1",
      "tarballUrl": "gs://mf-plugins-prod/plugins/security-attachment-scan/0.2.1/bundle.tgz",
      "integritySha256": "..."
    }
  ]
}
```

## Admin Workflow

1. Configure registry URL(s) in server settings.
2. Open the Plugin Library in the admin UI.
3. Allow a plugin.
4. Install a version.
5. Configure secrets/settings.
6. Enable it and include it in pipelines if needed.

## Pipelines (High Level)

- **Server pipelines** run on file events like `downloadableFile.created`.
- **Channel pipelines** run on channel events like `discussionChannel.created`.
- Channel pipelines can only use plugins that are installed and enabled at the server level.

## Troubleshooting

- **Install fails**: Check that the tarball is reachable and the SHA256 matches.
- **Version mismatch**: Ensure the registry version matches `plugin.json.version` inside the tarball.
- **Plugin not visible**: Confirm the registry URL is correct and refresh plugins.


# Hello World Plugin

The **Hello World** plugin demonstrates the Multiforum plugin lifecycle at the
channel scope. When a file-enabled channel activates the plugin it will log a
message and write a lightweight `info` flag every time downloadable content is
created or updated.

## Capabilities

- Runs whenever a `downloadableFile.created` or `downloadableFile.updated`
  event fires for the channel.
- Calls the host-provided `ctx.storeFlag()` helper so moderators can see when
  the hook executed.
- Requires no configuration or secrets.

## Settings Form

Because this is a sample plugin there are no settings to configure. The plugin
manifest still ships a form schema (see `plugin.json`) that renders a short
description so administrators can preview how manifest-driven forms appear in
the Multiforum UI.

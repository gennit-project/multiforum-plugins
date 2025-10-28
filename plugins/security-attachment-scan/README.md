# Security: Attachment Scan Plugin

The **Security: Attachment Scan** plugin protects downloadable uploads by
talking to the [VirusTotal API](https://www.virustotal.com/). When enabled at
the server scope it inspects zip files (and any other downloadable attachments)
as soon as they are uploaded and again right before a visitor downloads the
bundle.

## How It Works

1. A creator uploads a downloadable file to a channel.
2. Multiforum emits either `downloadableFile.created` or
   `downloadableFile.updated`.
3. The plugin posts the file URL to VirusTotal and stores the scan result by
   calling `ctx.storeFlag()`.
4. The pipeline UI surfaces a pass/fail badge for moderators and creators.
5. The public sees a confirmation that the virus scan ran before the download
   link is released.

The plugin also re-runs the scan when someone requests the download to guard
against newly-detected threats.

## Required Secrets

| Key                    | Scope  | Description                                                 |
| ---------------------- | ------ | ----------------------------------------------------------- |
| `VIRUS_TOTAL_API_KEY`  | Server | API key used to authenticate with the VirusTotal REST API.  |

The manifest ships UI metadata so administrators can save the key directly
inside Multiforum.

## Settings Form

The manifest exports a config schema with two sections:

- A **Secrets** section that renders a password input for the VirusTotal API
  key with validation hints.
- A **Settings** section where administrators can tweak the scan timeout and
  control whether downloads should be quarantined automatically if VirusTotal
  flags a threat.

See `plugin.json` for the full schema and default values.

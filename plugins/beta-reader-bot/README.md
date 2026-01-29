# Beta Reader Bot

This plugin responds to `/bot/betabot` mentions in comments with creative writing feedback. It ships with four ready-made profiles focused on developmental editing, line editing, thriller feedback, and character-driven fantasy critique.

## How It Works

- The plugin listens for the `comment.created` event.
- When a comment includes `/bot/betabot` or `/bot/betabot:<profile-id>`, it generates a reply.
- Replies are posted as bot users scoped to the channel.

## Configuration

### Required Secret

- `OPENAI_API_KEY` (server scope)

### Server Settings

- `botName`: Handle used in mentions (default `betabot`)
- `model`: OpenAI model name
- `temperature`: Sampling temperature
- `maxTokens`: Response token limit
- `defaultProfileId`: Profile used when no profile is specified
- `profilesJson`: JSON array of profiles (optional override)

### Channel Settings

- `overrideProfiles`: When enabled, channel profiles replace the server list
- `botName`: Optional channel-specific handle
- `defaultProfileId`: Optional channel-specific default profile
- `profilesJson`: Channel profile list (used when override is enabled)

## Built-in Profiles

- `developmental-editor` (default)
- `line-editor`
- `thriller-fan`
- `character-driven-fantasy-fan`

## Usage

- Default profile: `/bot/betabot`
- Explicit profile: `/bot/betabot:line-editor`

## Notes

- Bot mentions only match lowercase handles with letters, numbers, and hyphens.
- Bot replies are skipped for comments authored by bots to avoid loops.

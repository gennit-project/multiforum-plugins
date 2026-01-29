# ChatGPT Bot Profiles

This plugin responds to `/bot/<handle>` mentions in comments by generating a reply via the OpenAI Chat Completions API. It supports multiple bot profiles with distinct system prompts.

## How It Works

- The plugin listens for the `comment.created` event.
- When a comment includes `/bot/<handle>` or `/bot/<handle>:<profile-id>`, it generates a reply.
- Replies are posted as bot users scoped to the channel.

## Configuration

### Required Secret

- `OPENAI_API_KEY` (server scope)

### Server Settings

- `botName`: Handle used in mentions (default `chatgpt-bot`)
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

## Profile Format

Profiles are JSON objects (use `label` or `displayName`):

```json
[
  {
    "id": "general",
    "label": "General Assistant",
    "prompt": "You are a helpful assistant."
  }
]
```

## Usage

- Default profile: `/bot/chatgpt-bot`
- Explicit profile: `/bot/chatgpt-bot:general`

## Notes

- Bot mentions only match lowercase handles with letters, numbers, and hyphens.
- Bot replies are skipped for comments authored by bots to avoid loops.

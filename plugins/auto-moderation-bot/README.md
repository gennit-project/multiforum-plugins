# Auto-Moderation Bot

An AI-powered auto-moderation bot that analyzes content for rule violations and creates reports for human review.

## Overview

This plugin uses OpenAI's GPT models to analyze comments for potential rule violations. Unlike traditional auto-moderation systems that take direct action, this bot is **report-only** - it creates moderation issues that human moderators must review before taking any action.

## Key Features

- **Report-Only**: The bot never archives, deletes, or suspends content automatically. It only creates reports.
- **Confidence-Based**: Only reports content when the AI's confidence exceeds a configurable threshold (default: 70%).
- **Rule-Aware**: Analyzes content against the specific rules defined for each forum/channel.
- **Multiple Profiles**: Supports different moderation focuses (general, spam detection, harassment detection).
- **Full Auditability**: All reports are attributed to the bot's ModerationProfile for transparency.
- **Human Review Required**: Every report appears in the moderation queue for human review.

## How It Works

1. When a comment is created, the bot analyzes it using OpenAI's API.
2. The AI evaluates the content against the forum's rules.
3. If a potential violation is detected with sufficient confidence:
   - A moderation issue is created (or updated if one already exists for that content).
   - The report includes the confidence level, explanation, and violated rules.
   - Human moderators see the report in their moderation queue.
4. If no violation is detected or confidence is below the threshold, no action is taken.

## Configuration

### Server Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `botName` | The bot username prefix | `automod` |
| `model` | OpenAI model to use | `gpt-4o-mini` |
| `temperature` | AI creativity (lower = more deterministic) | `0.3` |
| `maxTokens` | Maximum response length | `1000` |
| `confidenceThreshold` | Minimum confidence to create a report (0.0-1.0) | `0.7` |
| `defaultProfileId` | Default moderation profile to use | `general-moderation` |

### Channel Overrides

Channels can override the confidence threshold and moderation profiles to adjust sensitivity for their specific needs.

## Moderation Profiles

### General Moderation (default)
Balanced detection of rule violations including harassment, spam, and community guideline violations.

### Spam Detection
Focused on detecting promotional content, off-topic advertising, and repetitive spam.

### Harassment Detection
Focused on detecting personal attacks, threats, hate speech, and targeted harassment.

## Report Format

Reports created by the bot follow this format:

```
[Automated Report - General Moderation]

Confidence: 85%

This comment appears to violate the "No spam or self-promotion" rule because it
contains multiple promotional links to external products without contributing
to the discussion.

Violated Rules: No spam or self-promotion

---
This report was generated automatically by the auto-moderation bot.
A human moderator should review this content before taking action.
```

## Best Practices

1. **Start with a higher threshold**: Begin with 0.8 or higher and lower it if needed.
2. **Review reports regularly**: The bot is designed to assist, not replace human judgment.
3. **Adjust profiles per channel**: Different communities may need different moderation focuses.
4. **Monitor false positives**: If the bot reports too much legitimate content, raise the threshold.

## Technical Details

- Uses OpenAI's Chat Completions API with JSON mode for structured responses.
- Bot users are automatically created with ModerationProfiles for proper attribution.
- Reports integrate with the existing issue/moderation action system.
- Multiple reports on the same content are added to the existing issue rather than creating duplicates.

## Privacy & Data

- Comment content is sent to OpenAI for analysis.
- No content is stored by the plugin beyond what's recorded in the moderation issue.
- The bot does not have access to private user information beyond what's visible in the comment.

## Limitations

- Only analyzes comment content (not discussions or events in this version).
- Requires an OpenAI API key with sufficient quota.
- Analysis quality depends on the clarity of forum rules.
- Cannot detect context that requires seeing deleted/edited versions.

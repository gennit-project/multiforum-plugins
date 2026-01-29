// Beta Reader Bot plugin
// Responds to /bot mentions in comments with creative writing feedback.

type BotMention = {
  handle: string;
  profileId: string | null;
  raw: string;
};

type BotProfile = {
  id: string;
  displayName: string;
  prompt: string;
};

interface HookContext {
  scope: "SERVER" | "CHANNEL" | "FORUM";
  channelId?: string;
  settings: Record<string, unknown>;
  secrets?: {
    server?: Record<string, string>;
    forum?: Record<string, string>;
  };
  storeFlag: (input: {
    targetId: string;
    type: string;
    severity: "low" | "med" | "high";
    message: string;
    meta?: any;
  }) => Promise<void>;
  log: (...args: any[]) => void;
  createCommentAsBot?: (input: {
    text: string;
    botName: string;
    profileId?: string | null;
    profileLabel?: string | null;
    parentCommentId?: string | null;
  }) => Promise<any>;
}

interface EventEnvelope {
  type: "comment.created";
  payload: {
    commentId: string;
    commentText?: string | null;
    botMentions?: BotMention[];
    isFeedbackComment?: boolean;
    createdAt?: string;
    author?: {
      username?: string;
      displayName?: string | null;
      isBot?: boolean;
    } | null;
    discussion?: {
      id: string;
      title?: string | null;
      body?: string | null;
    } | null;
    channel?: {
      uniqueName?: string | null;
      displayName?: string | null;
    } | null;
    parentCommentId?: string | null;
  };
}

type ChatSettings = {
  server?: {
    botName?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    defaultProfileId?: string;
    profiles?: BotProfile[];
    profilesJson?: string;
  };
  channel?: {
    overrideProfiles?: boolean;
    botName?: string;
    defaultProfileId?: string;
    profiles?: BotProfile[];
    profilesJson?: string;
  };
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const parseProfilesInput = (input: unknown, logger: HookContext["log"]): BotProfile[] => {
  if (Array.isArray(input)) {
    return input
      .map((profile) => normalizeProfile(profile))
      .filter((profile): profile is BotProfile => Boolean(profile));
  }

  if (isNonEmptyString(input)) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed
          .map((profile) => normalizeProfile(profile))
          .filter((profile): profile is BotProfile => Boolean(profile));
      }
    } catch (error: any) {
      logger(`Failed to parse profiles JSON: ${error?.message || error}`);
    }
  }

  return [];
};

const normalizeProfile = (profile: any): BotProfile | null => {
  if (!profile || typeof profile !== "object") return null;
  const id = isNonEmptyString(profile.id) ? profile.id.trim() : "";
  const displayName = isNonEmptyString(profile.displayName)
    ? profile.displayName.trim()
    : isNonEmptyString(profile.label)
      ? profile.label.trim()
      : id;
  const prompt = isNonEmptyString(profile.prompt) ? profile.prompt.trim() : "";

  if (!id || !prompt) return null;
  return { id, displayName: displayName || id, prompt };
};

export default class BetaReaderBot {
  private context: HookContext;
  private logger: HookContext["log"];
  private apiKey?: string;
  private fetchImpl: typeof fetch | null;

  constructor(context: HookContext) {
    this.context = context;
    this.logger = context.log;
    this.apiKey = context.secrets?.server?.OPENAI_API_KEY;
    this.fetchImpl = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;

    if (!this.fetchImpl) {
      this.logger("Fetch API is not available in this runtime");
    }
  }

  private getSettings(): Required<ChatSettings> {
    const settings = (this.context.settings || {}) as ChatSettings;
    return {
      server: settings.server || {},
      channel: settings.channel || {}
    };
  }

  private getEffectiveConfig() {
    const rawSettings = (this.context.settings || {}) as ChatSettings & Record<string, any>;
    const { server, channel } = this.getSettings();

    const serverProfiles = parseProfilesInput(server.profilesJson || server.profiles, this.logger);
    const rootProfiles = parseProfilesInput(rawSettings.profilesJson || rawSettings.profiles, this.logger);
    const channelProfiles = parseProfilesInput(channel.profilesJson || channel.profiles, this.logger);

    const overrideProfiles = channel.overrideProfiles === true || rawSettings.overrideProfiles === true;
    const profiles = overrideProfiles
      ? (channelProfiles.length ? channelProfiles : rootProfiles.length ? rootProfiles : serverProfiles)
      : (rootProfiles.length ? rootProfiles : serverProfiles);

    const botName = isNonEmptyString(channel.botName)
      ? channel.botName.trim()
      : isNonEmptyString(rawSettings.botName)
        ? rawSettings.botName.trim()
        : server.botName || "betabot";

    const defaultProfileId = isNonEmptyString(channel.defaultProfileId)
      ? channel.defaultProfileId.trim()
      : isNonEmptyString(rawSettings.defaultProfileId)
        ? rawSettings.defaultProfileId.trim()
        : server.defaultProfileId || (profiles[0]?.id || "developmental-editor");

    const model = isNonEmptyString(rawSettings.model) ? rawSettings.model.trim() : (server.model || "gpt-4o-mini");
    const temperature = typeof rawSettings.temperature === "number"
      ? rawSettings.temperature
      : typeof server.temperature === "number"
        ? server.temperature
        : 0.7;
    const maxTokens = typeof rawSettings.maxTokens === "number"
      ? rawSettings.maxTokens
      : typeof server.maxTokens === "number"
        ? server.maxTokens
        : 900;

    return {
      botName,
      model,
      temperature,
      maxTokens,
      defaultProfileId,
      profiles,
      overrideProfiles
    };
  }

  private resolveProfile(profileId: string | null, profiles: BotProfile[], fallbackId: string): BotProfile | null {
    if (profileId) {
      const requested = profiles.find((profile) => profile.id === profileId);
      if (requested) return requested;
    }

    const fallback = profiles.find((profile) => profile.id === fallbackId);
    return fallback || profiles[0] || null;
  }

  private buildUserPrompt(event: EventEnvelope["payload"], profile: BotProfile) {
    const parts: string[] = [];
    parts.push(`Profile: ${profile.displayName}`);

    if (event.discussion?.title) {
      parts.push(`Discussion title: ${event.discussion.title}`);
    }
    if (event.discussion?.body) {
      parts.push(`Discussion body: ${event.discussion.body}`);
    }

    if (event.commentText) {
      parts.push(`Comment text: ${event.commentText}`);
    }

    if (event.parentCommentId) {
      parts.push(`Parent comment id: ${event.parentCommentId}`);
    }

    return parts.join("\n\n");
  }

  private async requestCompletion(input: {
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    userPrompt: string;
  }) {
    if (!this.fetchImpl) {
      throw new Error("Fetch API is not available");
    }

    const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI API request failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!isNonEmptyString(content)) {
      throw new Error("OpenAI API returned an empty response");
    }

    return content.trim();
  }

  async handleEvent(event: EventEnvelope) {
    if (event.type !== "comment.created") {
      return { success: true, result: { message: "Event ignored" } };
    }

    if (!this.apiKey) {
      return {
        success: false,
        error: "OPENAI_API_KEY is required but not configured",
        configurationRequired: true,
        missingSecrets: ["OPENAI_API_KEY"]
      };
    }

    if (!event.payload?.commentText) {
      return { success: true, result: { message: "No comment text provided" } };
    }

    if (event.payload.author?.isBot) {
      return { success: true, result: { message: "Ignoring bot-authored comment" } };
    }

    const config = this.getEffectiveConfig();
    const mentions = event.payload.botMentions || [];
    const matchingMentions = mentions.filter((mention) => mention.handle === config.botName);

    if (matchingMentions.length === 0) {
      return { success: true, result: { message: "No bot mentions found" } };
    }

    if (config.profiles.length === 0) {
      return {
        success: false,
        error: "No bot profiles configured",
        configurationRequired: true
      };
    }

    if (!this.context.createCommentAsBot) {
      return {
        success: false,
        error: "Plugin runtime does not support createCommentAsBot"
      };
    }

    const uniqueProfiles = new Map<string, BotProfile>();
    for (const mention of matchingMentions) {
      const profile = this.resolveProfile(mention.profileId, config.profiles, config.defaultProfileId);
      if (profile) {
        uniqueProfiles.set(profile.id, profile);
      } else {
        this.logger(`No profile found for mention ${mention.raw}`);
      }
    }

    if (uniqueProfiles.size === 0) {
      return { success: true, result: { message: "No matching profiles found" } };
    }

    const results: Array<{ profileId: string; commentId?: string }> = [];

    for (const profile of uniqueProfiles.values()) {
      try {
        const replyText = await this.requestCompletion({
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          systemPrompt: profile.prompt,
          userPrompt: this.buildUserPrompt(event.payload, profile)
        });

        const created = await this.context.createCommentAsBot({
          text: replyText,
          botName: config.botName,
          profileId: profile.id,
          profileLabel: profile.displayName,
          parentCommentId: event.payload.commentId
        });

        results.push({ profileId: profile.id, commentId: created?.id });
      } catch (error: any) {
        this.logger(`Failed to generate reply for profile ${profile.id}: ${error?.message || error}`);
        return {
          success: false,
          error: `Failed to generate reply for profile ${profile.id}`,
          retryable: true
        };
      }
    }

    return {
      success: true,
      result: {
        message: `Generated ${results.length} bot reply(ies)`,
        botName: config.botName,
        profiles: results
      }
    };
  }

  static validateSecrets(secrets: Record<string, string>) {
    const errors: string[] = [];
    const apiKey = secrets.OPENAI_API_KEY;

    if (!apiKey || apiKey.trim().length === 0) {
      errors.push("OPENAI_API_KEY is required");
    } else if (apiKey.length < 10) {
      errors.push("OPENAI_API_KEY must be at least 10 characters long");
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

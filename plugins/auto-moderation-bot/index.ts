// Auto-Moderation Bot plugin
// Analyzes content for rule violations and creates reports for human review.

type ModerationProfile = {
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
  logPromptDebug?: (input: {
    prompt: string;
    context?: unknown;
    label?: string;
  }) => void;
  reportContentAsBot?: (input: {
    contentType: "comment" | "discussion" | "event";
    contentId: string;
    reportText: string;
    selectedForumRules: string[];
    selectedServerRules: string[];
    botName: string;
    profileId?: string | null;
    profileLabel?: string | null;
  }) => Promise<{ issueId: string; issueNumber: number } | null>;
}

interface EventEnvelope {
  type: "comment.created";
  payload: {
    commentId: string;
    commentText?: string | null;
    botMentions?: Array<{ handle: string; profileId: string | null; raw: string }>;
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
      description?: string | null;
      rules?: string[];
    } | null;
    parentCommentId?: string | null;
    context?: {
      invocationType?: string;
      channel?: {
        uniqueName?: string | null;
        displayName?: string | null;
        description?: string | null;
        rules?: string[];
      } | null;
      discussion?: {
        id?: string | null;
        title?: string | null;
        body?: string | null;
      } | null;
      comment?: {
        id?: string | null;
        text?: string | null;
        authorUsername?: string | null;
        authorLabel?: string | null;
        parentCommentId?: string | null;
      } | null;
      thread?: {
        rootCommentId?: string | null;
        parentComments?: Array<{
          id?: string | null;
          text?: string | null;
          authorUsername?: string | null;
          authorLabel?: string | null;
        }>;
      } | null;
    } | null;
  };
}

type ModerationSettings = {
  server?: {
    botName?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    confidenceThreshold?: number;
    defaultProfileId?: string;
    profiles?: ModerationProfile[];
    profilesJson?: string;
  };
  channel?: {
    overrideProfiles?: boolean;
    botName?: string;
    confidenceThreshold?: number;
    defaultProfileId?: string;
    profiles?: ModerationProfile[];
    profilesJson?: string;
  };
};

type ModerationAnalysis = {
  hasViolation: boolean;
  confidence: number;
  violatedRules: string[];
  explanation: string;
  suggestedAction: "report" | "none";
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const parseProfilesInput = (input: unknown, logger: HookContext["log"]): ModerationProfile[] => {
  if (Array.isArray(input)) {
    return input
      .map((profile) => normalizeProfile(profile))
      .filter((profile): profile is ModerationProfile => Boolean(profile));
  }

  if (isNonEmptyString(input)) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        return parsed
          .map((profile) => normalizeProfile(profile))
          .filter((profile): profile is ModerationProfile => Boolean(profile));
      }
    } catch (error: any) {
      logger(`Failed to parse profiles JSON: ${error?.message || error}`);
    }
  }

  return [];
};

const normalizeProfile = (profile: any): ModerationProfile | null => {
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

export default class AutoModerationBot {
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

  private getSettings(): Required<ModerationSettings> {
    const settings = (this.context.settings || {}) as ModerationSettings;
    return {
      server: settings.server || {},
      channel: settings.channel || {}
    };
  }

  private getEffectiveConfig() {
    const rawSettings = (this.context.settings || {}) as ModerationSettings & Record<string, any>;
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
        : server.botName || "automod";

    const defaultProfileId = isNonEmptyString(channel.defaultProfileId)
      ? channel.defaultProfileId.trim()
      : isNonEmptyString(rawSettings.defaultProfileId)
        ? rawSettings.defaultProfileId.trim()
        : server.defaultProfileId || (profiles[0]?.id || "general-moderation");

    const model = isNonEmptyString(rawSettings.model) ? rawSettings.model.trim() : (server.model || "gpt-4o-mini");
    const temperature = typeof rawSettings.temperature === "number"
      ? rawSettings.temperature
      : typeof server.temperature === "number"
        ? server.temperature
        : 0.3;
    const maxTokens = typeof rawSettings.maxTokens === "number"
      ? rawSettings.maxTokens
      : typeof server.maxTokens === "number"
        ? server.maxTokens
        : 1000;

    const confidenceThreshold = typeof channel.confidenceThreshold === "number"
      ? channel.confidenceThreshold
      : typeof rawSettings.confidenceThreshold === "number"
        ? rawSettings.confidenceThreshold
        : typeof server.confidenceThreshold === "number"
          ? server.confidenceThreshold
          : 0.7;

    return {
      botName,
      model,
      temperature,
      maxTokens,
      confidenceThreshold,
      defaultProfileId,
      profiles,
      overrideProfiles
    };
  }

  private resolveProfile(profileId: string | null, profiles: ModerationProfile[], fallbackId: string): ModerationProfile | null {
    if (profileId) {
      const requested = profiles.find((profile) => profile.id === profileId);
      if (requested) return requested;
    }

    const fallback = profiles.find((profile) => profile.id === fallbackId);
    return fallback || profiles[0] || null;
  }

  private buildModerationPrompt(event: EventEnvelope["payload"], profile: ModerationProfile): string {
    const context = event.context;
    const channel = context?.channel || event.channel;
    const rules = channel?.rules || [];

    const parts: string[] = [];
    parts.push(`Moderation Profile: ${profile.displayName}`);

    if (channel?.displayName || channel?.uniqueName) {
      parts.push(`Forum: ${channel.displayName || channel.uniqueName}`);
    }

    if (channel?.description) {
      parts.push(`Forum Description: ${channel.description}`);
    }

    if (rules.length > 0) {
      parts.push(`Forum Rules:\n${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}`);
    } else {
      parts.push("Forum Rules: (No specific rules defined for this forum)");
    }

    return parts.join("\n\n");
  }

  private buildUserPrompt(event: EventEnvelope["payload"]): string {
    const context = event.context;
    const comment = context?.comment;
    const discussion = context?.discussion || event.discussion;
    const parentComments = context?.thread?.parentComments || [];

    const parts: string[] = [];

    if (discussion?.title) {
      parts.push(`Discussion Title: ${discussion.title}`);
    }

    if (discussion?.body) {
      const truncatedBody = discussion.body.length > 500
        ? discussion.body.substring(0, 500) + "..."
        : discussion.body;
      parts.push(`Discussion Body: ${truncatedBody}`);
    }

    if (parentComments.length > 0) {
      parts.push(
        `Parent Comment Thread:\n${parentComments
          .map((parent, index) => {
            const author = parent.authorLabel || parent.authorUsername || "Unknown author";
            return `${index + 1}. ${author}: ${parent.text || ""}`;
          })
          .join("\n")}`
      );
    }

    const commentText = comment?.text || event.commentText;
    const commentAuthor = comment?.authorLabel || comment?.authorUsername || event.author?.displayName || event.author?.username || "Unknown";

    parts.push(`\n--- Content to Analyze ---`);
    parts.push(`Author: ${commentAuthor}`);
    parts.push(`Comment: ${commentText}`);
    parts.push(`\nAnalyze this comment and determine if it violates any of the forum rules listed above. Respond with a JSON object only.`);

    return parts.join("\n\n");
  }

  private async requestModerationAnalysis(input: {
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    userPrompt: string;
  }): Promise<ModerationAnalysis> {
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
        response_format: { type: "json_object" },
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

    try {
      const analysis = JSON.parse(content.trim()) as ModerationAnalysis;

      // Validate and normalize the response
      return {
        hasViolation: Boolean(analysis.hasViolation),
        confidence: typeof analysis.confidence === "number" ? Math.min(1, Math.max(0, analysis.confidence)) : 0,
        violatedRules: Array.isArray(analysis.violatedRules) ? analysis.violatedRules : [],
        explanation: typeof analysis.explanation === "string" ? analysis.explanation : "",
        suggestedAction: analysis.suggestedAction === "report" ? "report" : "none"
      };
    } catch (parseError) {
      this.logger(`Failed to parse moderation analysis JSON: ${content}`);
      throw new Error("Failed to parse moderation analysis response");
    }
  }

  private buildReportText(analysis: ModerationAnalysis, profile: ModerationProfile): string {
    const confidencePercent = Math.round(analysis.confidence * 100);

    return `[Automated Report - ${profile.displayName}]

Confidence: ${confidencePercent}%

${analysis.explanation}

Violated Rules: ${analysis.violatedRules.length > 0 ? analysis.violatedRules.join(", ") : "Unspecified"}

---
This report was generated automatically by the auto-moderation bot.
A human moderator should review this content before taking action.`;
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

    if (!event.payload?.commentText && !event.payload?.context?.comment?.text) {
      return { success: true, result: { message: "No comment text provided" } };
    }

    // Skip bot-authored content to avoid infinite loops
    if (event.payload.author?.isBot) {
      return { success: true, result: { message: "Ignoring bot-authored comment" } };
    }

    if (!this.context.reportContentAsBot) {
      return {
        success: false,
        error: "Plugin runtime does not support reportContentAsBot"
      };
    }

    const config = this.getEffectiveConfig();

    if (config.profiles.length === 0) {
      return {
        success: false,
        error: "No moderation profiles configured",
        configurationRequired: true
      };
    }

    // Use the default profile for automatic moderation
    const profile = this.resolveProfile(null, config.profiles, config.defaultProfileId);
    if (!profile) {
      return { success: true, result: { message: "No matching moderation profile found" } };
    }

    try {
      const systemPrompt = profile.prompt;
      const contextPrompt = this.buildModerationPrompt(event.payload, profile);
      const userPrompt = this.buildUserPrompt(event.payload);
      const fullSystemPrompt = `${systemPrompt}\n\n${contextPrompt}`;

      this.context.logPromptDebug?.({
        label: `auto-moderation-bot:${profile.id}`,
        prompt: `System:\n${fullSystemPrompt}\n\nUser:\n${userPrompt}`,
        context: event.payload.context || event.payload
      });

      const analysis = await this.requestModerationAnalysis({
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        systemPrompt: fullSystemPrompt,
        userPrompt
      });

      this.logger(`Moderation analysis for comment ${event.payload.commentId}:`, {
        hasViolation: analysis.hasViolation,
        confidence: analysis.confidence,
        threshold: config.confidenceThreshold,
        violatedRules: analysis.violatedRules
      });

      // Only report if there's a violation AND confidence meets threshold
      if (!analysis.hasViolation || analysis.confidence < config.confidenceThreshold) {
        return {
          success: true,
          result: {
            message: "Content analyzed - no report needed",
            analysis: {
              hasViolation: analysis.hasViolation,
              confidence: analysis.confidence,
              threshold: config.confidenceThreshold
            }
          }
        };
      }

      // Create the report
      const reportText = this.buildReportText(analysis, profile);

      // Determine which rules were forum rules vs server rules
      // For simplicity, we'll put all detected rules in selectedForumRules
      // In a more sophisticated implementation, you could match against known rule sets
      const selectedForumRules = analysis.violatedRules;
      const selectedServerRules: string[] = [];

      // If no specific rules were identified, use a generic violation
      if (selectedForumRules.length === 0) {
        selectedForumRules.push("Potential rule violation detected by auto-moderation");
      }

      const reportResult = await this.context.reportContentAsBot({
        contentType: "comment",
        contentId: event.payload.commentId,
        reportText,
        selectedForumRules,
        selectedServerRules,
        botName: config.botName,
        profileId: profile.id,
        profileLabel: profile.displayName
      });

      if (!reportResult) {
        return {
          success: false,
          error: "Failed to create report",
          retryable: true
        };
      }

      return {
        success: true,
        result: {
          message: `Report created for comment ${event.payload.commentId}`,
          issueId: reportResult.issueId,
          issueNumber: reportResult.issueNumber,
          confidence: analysis.confidence,
          violatedRules: analysis.violatedRules,
          profile: profile.id
        }
      };
    } catch (error: any) {
      this.logger(`Failed to analyze content: ${error?.message || error}`);
      return {
        success: false,
        error: `Failed to analyze content: ${error?.message || "unknown error"}`,
        retryable: true
      };
    }
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

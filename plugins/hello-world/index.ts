// Hello World plugin
// A simple channel-scoped plugin that logs when content is created.

interface HookContext {
  scope: "SERVER" | "FORUM";
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
}

interface EventEnvelope {
  type: "downloadableFile.created" | "downloadableFile.updated" | "downloadableFile.downloaded";
  payload: {
    commentId?: string;
    discussionId?: string;
    attachmentUrls?: string[];
  };
}

export default class HelloWorld {
  private context: HookContext;
  private logger: HookContext['log'];

  constructor(context: HookContext) {
    this.context = context;
    this.logger = context.log;
  }

  async handleEvent(event: EventEnvelope) {
    try {
      this.logger(`Hello from channel ${this.context.channelId}! Event type: ${event.type}`);
      
      const targetId = event.payload.commentId ?? event.payload.discussionId;
      if (targetId) {
        await this.context.storeFlag({
          targetId,
          type: "info",
          severity: "low",
          message: `Hello World plugin executed for ${event.type}`,
        });
      }

      return { 
        success: true, 
        result: { 
          message: `Hello World plugin executed successfully for ${event.type}`,
          channelId: this.context.channelId,
          targetId 
        }
      };
      
    } catch (error: any) {
      this.logger('Hello World plugin failed:', error);
      return { 
        success: false, 
        error: error.message,
        retryable: true
      };
    }
  }

  static validateSecrets(_secrets: Record<string, string>) {
    // This plugin has no secrets to validate
    return {
      isValid: true,
      errors: []
    };
  }
}
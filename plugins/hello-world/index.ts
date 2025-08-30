// Hello World plugin
// A simple channel-scoped plugin that logs when content is created.

interface HookContext {
  scope: "SERVER" | "FORUM";
  channelId?: string;
  settings: Record<string, unknown>;
  secrets: Record<string, string>;
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
  type: "downloadableFile.created" | "downloadableFile.updated";
  payload: {
    commentId?: string;
    discussionId?: string;
    attachmentUrls?: string[];
  };
}

export default async function helloWorldPlugin(ctx: HookContext, event: EventEnvelope) {
  ctx.log(`Hello from channel ${ctx.channelId}! Event type: ${event.type}`);
  
  const targetId = event.payload.commentId ?? event.payload.discussionId;
  if (targetId) {
    await ctx.storeFlag({
      targetId,
      type: "info",
      severity: "low",
      message: `Hello World plugin executed for ${event.type}`,
    });
  }
}
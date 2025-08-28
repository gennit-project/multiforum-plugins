// Security: Attachment Scan plugin
// Runs at server scope and scans attachments using the VirusTotal API.

import fetch from "node-fetch";

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
  type: "comment.created" | "discussion.created";
  payload: {
    commentId?: string;
    discussionId?: string;
    attachmentUrls?: string[];
  };
}

export default async function scanPlugin(ctx: HookContext, event: EventEnvelope) {
  if (!event.payload.attachmentUrls || event.payload.attachmentUrls.length === 0) {
    ctx.log("No attachments to scan");
    return;
  }

  const apiKey = ctx.secrets["VIRUS_TOTAL_API_KEY"];
  if (!apiKey) {
    ctx.log("VirusTotal API key is not set — skipping scan");
    return;
  }

  for (const url of event.payload.attachmentUrls) {
    try {
      ctx.log(`Scanning attachment: ${url}`);
      // Example VirusTotal API call (stubbed for demo)
      const res = await fetch("https://www.virustotal.com/api/v3/urls", {
        method: "POST",
        headers: {
          "x-apikey": apiKey,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: `url=${encodeURIComponent(url)}`,
      });

      if (!res.ok) {
        ctx.log(`Failed to scan ${url}: ${res.statusText}`);
        continue;
      }

      const data = await res.json();
      ctx.log(`Scan result for ${url}:`, data);

      // For demo, just mark as success.
      await ctx.storeFlag({
        targetId: event.payload.commentId ?? event.payload.discussionId!,
        type: "security",
        severity: "low",
        message: `Scanned ${url} successfully with VirusTotal`,
      });
    } catch (err: any) {
      ctx.log(`Error scanning ${url}:`, err.message);
    }
  }
}

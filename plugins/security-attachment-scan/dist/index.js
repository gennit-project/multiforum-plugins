"use strict";
// Security: Attachment Scan plugin
// Runs at server scope and scans attachments using the VirusTotal API.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = scanPlugin;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function scanPlugin(ctx, event) {
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
            const res = await (0, node_fetch_1.default)("https://www.virustotal.com/api/v3/urls", {
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
                targetId: event.payload.commentId ?? event.payload.discussionId,
                type: "security",
                severity: "low",
                message: `Scanned ${url} successfully with VirusTotal`,
            });
        }
        catch (err) {
            ctx.log(`Error scanning ${url}:`, err.message);
        }
    }
}

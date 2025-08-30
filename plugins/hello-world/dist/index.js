"use strict";
// Hello World plugin
// A simple channel-scoped plugin that logs when content is created.
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = helloWorldPlugin;
async function helloWorldPlugin(ctx, event) {
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

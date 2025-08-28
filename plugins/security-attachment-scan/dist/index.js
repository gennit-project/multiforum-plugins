// ctx` exposes: `{ scope, channelId, settings, secrets, storeFlag, log }`.

// If `event.payload.attachmentUrls?.length`, call VirusTotal (or stub)
// and `ctx.storeFlag(...)` with success.
module.exports = async function(ctx, event) { /* … */ }

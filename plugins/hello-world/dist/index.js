// ctx` exposes: `{ scope, channelId, settings, secrets, storeFlag, log }`.
module.exports = async function (ctx, event) {
  console.log(`"hello from channel ${ctx.channelId}"`);
};

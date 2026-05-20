// Bot brains. Lives next to game/ because it also runs server-side when MP ships.
// Output: target (x, y) for the bot's blob each tick. No DOM access.

export const BOT_STATES = ['wander', 'chase', 'flee'];

export function decideBotMove(bot, world) {
  // Phase 2 will implement: scan nearby blobs, chase smaller, flee bigger, else wander.
  // For now, gentle drift so the scaffold runs without errors.
  if (!bot.targetX || Math.random() < 0.01) {
    bot.targetX = Math.random() * world.width;
    bot.targetY = Math.random() * world.height;
  }
  return { x: bot.targetX, y: bot.targetY };
}

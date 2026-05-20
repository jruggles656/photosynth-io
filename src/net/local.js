// Transport stub. Today: in-process, the "server" is just World.tick() in this tab.
// Tomorrow: replace this file with a socket.io client that sends commands to a real server
// and receives state snapshots back. The rest of the code shouldn't have to change.

export class LocalTransport {
  constructor(world) {
    this.world = world;
  }

  sendCommand(playerId, command) {
    // In single-player, commands are applied directly to the world.
    // In multiplayer this would emit('command', { playerId, command }).
    const player = this.world.blobs.get(playerId);
    if (!player) return;

    if (command.type === 'setTarget') {
      player.targetX = command.x;
      player.targetY = command.y;
    }
    // split / eject handled in Phase 2.
  }

  // Multiplayer counterpart will deliver server snapshots via this hook.
  onSnapshot(_callback) {
    // no-op in single-player; world IS the local snapshot
  }
}

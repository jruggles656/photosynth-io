// Transport stub. Today: in-process, the "server" is just World.tick() in this tab.
// Tomorrow: replace this file with a socket.io client that sends commands to a real server
// and receives state snapshots back. The rest of the code shouldn't have to change.

export class LocalTransport {
  constructor(world) {
    this.world = world;
  }

  sendCommand(ownerId, command) {
    // In single-player, commands route straight into the local world.
    // In multiplayer this would emit('command', { ownerId, command }).
    this.world.executeCommand(ownerId, command);
  }

  // Multiplayer counterpart will deliver server snapshots via this hook.
  onSnapshot(_callback) {
    // no-op in single-player; world IS the local snapshot
  }
}

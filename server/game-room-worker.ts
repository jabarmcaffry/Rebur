/**
 * game-room-worker.ts
 *
 * Entry point for a GameRoom running inside a node:worker_threads Worker.
 * The main thread communicates via postMessage / parentPort.on("message").
 *
 * Protocol (main → worker):
 *   setObjects, loadScripts, addPlayer, removePlayer, applyInput,
 *   syncPosition, handleObjectClick, handleGuiClick, handleKeyDown,
 *   handleKeyUp, handleNetworkMessage, setTickRate, pause, resume,
 *   stop, setInterestRadius, getPhysicsSnapshot, loadPhysicsSnapshot
 *
 * Protocol (worker → main):
 *   { type: "broadcast", msg }         — broadcast to all clients in session
 *   { type: "sendToPlayer", playerId, msg } — send to one client
 *   { type: "spawnPoint", point }       — sent after setObjects resolves spawn
 *   { type: "playerRender", playerId, render } — sent after addPlayer
 *   { type: "physicsSnapshot", requestId, snap } — response to getPhysicsSnapshot
 *   { type: "workerError", error }      — uncaught error in a message handler
 */

import { parentPort } from "worker_threads";
import { GameRoom } from "./game-room";

if (!parentPort) throw new Error("game-room-worker must run inside a Worker thread");

const room = new GameRoom(
  (msg) => parentPort!.postMessage({ type: "broadcast", msg }),
  (playerId, msg) => parentPort!.postMessage({ type: "sendToPlayer", playerId, msg }),
);

parentPort.on("message", (cmd: any) => {
  try {
    switch (cmd.type) {

      case "setObjects":
        room.setObjects(cmd.objects);
        parentPort!.postMessage({ type: "spawnPoint", point: room.getSpawnPoint() });
        break;

      case "loadScripts":
        room.loadScripts(cmd.scripts);
        break;

      case "addPlayer": {
        room.addPlayer(cmd.id, cmd.name, cmd.x, cmd.y, cmd.z, cmd.colors);
        const render = room.getPlayerRender(cmd.id);
        if (render) {
          parentPort!.postMessage({ type: "playerRender", playerId: cmd.id, render });
        }
        break;
      }

      case "removePlayer":
        room.removePlayer(cmd.id);
        break;

      case "applyInput":
        room.applyInput(cmd.playerId, cmd.moveX, cmd.moveZ, cmd.jump, cmd.rotY, cmd.camY, cmd.sprint ?? false);
        break;

      case "syncPosition":
        room.syncPosition(cmd.playerId, cmd.x, cmd.y, cmd.z, cmd.rotY);
        break;

      case "handleObjectClick":
        room.handleObjectClick(cmd.playerId, cmd.objectId);
        break;

      case "handleGuiClick":
        room.handleGuiClick(cmd.playerId, cmd.elementId);
        break;

      case "handleKeyDown":
        room.handleKeyDown(cmd.playerId, cmd.key);
        break;

      case "handleKeyUp":
        room.handleKeyUp(cmd.playerId, cmd.key);
        break;

      case "handleNetworkMessage":
        room.handleNetworkMessage(cmd.playerId, cmd.event, cmd.payload);
        break;

      case "setTickRate":
        room.setTickRate(cmd.hz);
        break;

      case "pause":
        room.pause();
        break;

      case "resume":
        room.resume();
        break;

      case "stop":
        room.stop();
        break;

      case "setInterestRadius":
        room.setInterestRadius(cmd.units);
        break;

      case "getPhysicsSnapshot": {
        const snap = room.getPhysicsSnapshot();
        parentPort!.postMessage({ type: "physicsSnapshot", requestId: cmd.requestId, snap });
        break;
      }

      case "loadPhysicsSnapshot":
        room.loadPhysicsSnapshot(cmd.snap);
        break;

      default:
        console.warn("[game-room-worker] unknown command:", cmd.type);
    }
  } catch (err) {
    parentPort!.postMessage({ type: "workerError", error: String(err) });
  }
});

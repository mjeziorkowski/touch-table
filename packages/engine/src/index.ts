import { WebSocketServer, WebSocket } from 'ws';
import { GameState, SocketMessage, ClientType, GamePiece } from '@touch-table/types';

const PORT = Number(process.env.PORT) || 3000;

// Initialize a simple in-memory GameState
let gameState: GameState = {
  pieces: [
    { id: 'piece-1', name: 'Red Disc', x: 0.25, y: 0.5, color: '#e63946', size: 0.05 },
    { id: 'piece-2', name: 'Blue Disc', x: 0.5, y: 0.5, color: '#1d3557', size: 0.05 },
    { id: 'piece-3', name: 'Green Disc', x: 0.75, y: 0.5, color: '#2a9d8f', size: 0.05 }
  ]
};

// Track client sockets and their types
const clients = new Map<WebSocket, ClientType>();

const wss = new WebSocketServer({ port: PORT });

console.log(`[Engine] WebSocket Server running on port ${PORT}`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[Engine] New client connected');

  ws.on('message', (message: string) => {
    try {
      const parsedMessage = JSON.parse(message) as SocketMessage;
      
      switch (parsedMessage.type) {
        case 'register': {
          clients.set(ws, parsedMessage.clientType);
          console.log(`[Engine] Client registered as: ${parsedMessage.clientType}`);
          if (parsedMessage.clientType === 'renderer') {
            // Send initial state to the newly registered renderer
            ws.send(JSON.stringify({ type: 'state-update', state: gameState }));
          }
          break;
        }

        case 'touch-event': {
          // Verify that this comes from a simulator (or treat it as touch)
          // Broadcast touch event to all renderers
          const msgString = JSON.stringify({ type: 'touch-event', touch: parsedMessage.touch });
          broadcastToType('renderer', msgString);
          break;
        }

        case 'update-piece': {
          // Update game state with the new piece coordinates
          const updatedPiece = parsedMessage.piece;
          const pieceIdx = gameState.pieces.findIndex(p => p.id === updatedPiece.id);
          if (pieceIdx !== -1) {
            gameState.pieces[pieceIdx] = updatedPiece;
            console.log(`[Engine] Piece "${updatedPiece.name}" updated to (${updatedPiece.x.toFixed(3)}, ${updatedPiece.y.toFixed(3)})`);
            
            // Broadcast the state update to all renderers (except maybe the sender, but broadcasting to all is fine)
            broadcastToType('renderer', JSON.stringify({ type: 'state-update', state: gameState }));
          }
          break;
        }

        case 'request-state': {
          ws.send(JSON.stringify({ type: 'state-update', state: gameState }));
          break;
        }

        case 'canvas-cast': {
          // Broadcast canvas frame from renderer to simulators
          broadcastToType('simulator', JSON.stringify({ type: 'canvas-cast', image: parsedMessage.image }));
          break;
        }

        default:
          console.warn(`[Engine] Unknown message type: ${(parsedMessage as any).type}`);
      }
    } catch (err) {
      console.error('[Engine] Failed to process message', err);
    }
  });

  ws.on('close', () => {
    const clientType = clients.get(ws);
    clients.delete(ws);
    console.log(`[Engine] Client disconnected (${clientType || 'unregistered'})`);
  });

  ws.on('error', (err) => {
    console.error('[Engine] Socket error:', err);
  });
});

function broadcastToType(type: ClientType, message: string) {
  for (const [ws, clientType] of clients.entries()) {
    if (clientType === type && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

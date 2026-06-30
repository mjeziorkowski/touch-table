<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { GameState, TouchPoint, SocketMessage, GamePiece } from '@touch-table/types';
import GameBoard from './components/GameBoard.vue';

const socketStatus = ref<'connecting' | 'connected' | 'disconnected'>('connecting');
const gameState = ref<GameState>({ pieces: [] });
const activeTouch = ref<TouchPoint | null>(null);

let socket: WebSocket | null = null;
let reconnectInterval: any = null;

function connect() {
  const wsUrl = `ws://${window.location.hostname}:3000`;
  console.log(`[Renderer] Connecting to Engine at ${wsUrl}`);
  socketStatus.value = 'connecting';
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('[Renderer] Connected to Engine');
    socketStatus.value = 'connected';
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }

    // Register as renderer
    sendSocketMessage({
      type: 'register',
      clientType: 'renderer'
    });
  };

  socket.onclose = () => {
    console.log('[Renderer] Disconnected. Reconnecting...');
    socketStatus.value = 'disconnected';
    
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connect, 2000);
    }
  };

  socket.onerror = (err) => {
    console.error('[Renderer] WebSocket error:', err);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as SocketMessage;
      
      if (msg.type === 'state-update') {
        gameState.value = msg.state;
      } else if (msg.type === 'touch-event') {
        activeTouch.value = msg.touch;
      }
    } catch (err) {
      console.error('[Renderer] Error processing message:', err);
    }
  };
}

function sendSocketMessage(msg: SocketMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

// When a piece is dragged in the 3D scene, notify the engine
function handlePieceMoved(updatedPiece: GamePiece) {
  sendSocketMessage({
    type: 'update-piece',
    piece: updatedPiece
  });
}

// Reset pieces to default configurations
function resetBoard() {
  const defaults: GamePiece[] = [
    { id: 'piece-1', name: 'Red Disc', x: 0.25, y: 0.5, color: '#e63946', size: 0.05 },
    { id: 'piece-2', name: 'Blue Disc', x: 0.5, y: 0.5, color: '#1d3557', size: 0.05 },
    { id: 'piece-3', name: 'Green Disc', x: 0.75, y: 0.5, color: '#2a9d8f', size: 0.05 }
  ];
  
  defaults.forEach(piece => {
    sendSocketMessage({
      type: 'update-piece',
      piece
    });
  });
}

onMounted(() => {
  connect();
});

onUnmounted(() => {
  if (socket) socket.close();
  if (reconnectInterval) clearInterval(reconnectInterval);
});
</script>

<template>
  <div class="app-container">
    <div class="ui-panel">
      <h2>Game Board Tabletop</h2>
      
      <div class="status-indicator" :class="socketStatus">
        <span class="dot"></span>
        <span>Engine: {{ socketStatus }}</span>
      </div>

      <div class="pieces-info">
        <h3>Board Pieces</h3>
        <div v-for="piece in gameState.pieces" :key="piece.id" class="piece-row">
          <span class="color-badge" :style="{ backgroundColor: piece.color }"></span>
          <span class="piece-name">{{ piece.name }}</span>
          <span class="piece-coords">({{ piece.x.toFixed(2) }}, {{ piece.y.toFixed(2) }})</span>
        </div>
      </div>

      <button class="reset-btn" @click="resetBoard">Reset Pieces</button>
    </div>

    <!-- The 3D Game Board Viewport -->
    <GameBoard 
      :game-state="gameState" 
      :active-touch="activeTouch"
      @piece-moved="handlePieceMoved"
    />
  </div>
</template>

<style scoped>
.app-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  overflow: hidden;
}

.ui-panel {
  position: absolute;
  top: 20px;
  left: 20px;
  width: 280px;
  background: rgba(18, 18, 22, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 20px;
  color: #fff;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

h2 {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

h3 {
  font-size: 12px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
  letter-spacing: 0.05em;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 12px;
  border-radius: 6px;
  align-self: flex-start;
}

.status-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ff3b30;
}

.status-indicator.connected .dot {
  background-color: #34c759;
  box-shadow: 0 0 8px #34c759;
}

.status-indicator.connecting .dot {
  background-color: #ffcc00;
}

.pieces-info {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.piece-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 6px;
}

.color-badge {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.piece-name {
  flex-grow: 1;
}

.piece-coords {
  font-family: monospace;
  color: rgba(255, 255, 255, 0.4);
}

.reset-btn {
  background: #3a3a4c;
  color: #fff;
  border: none;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
  transition: background 0.2s;
}

.reset-btn:hover {
  background: #4a4a5e;
}
</style>

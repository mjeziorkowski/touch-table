import { SocketMessage } from '@touch-table/types';

const container = document.getElementById('simulator-container') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const coordinatesEl = document.getElementById('coordinates') as HTMLDivElement;

let socket: WebSocket | null = null;
let reconnectInterval: any = null;

// Local active indicator elements
const activeIndicators = new Map<string, HTMLDivElement>();

function connect() {
  const wsUrl = `ws://${window.location.hostname}:3000`;
  console.log(`[Simulator] Connecting to Engine at ${wsUrl}`);
  
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('[Simulator] Connected to Engine');
    statusEl.textContent = 'Connected';
    statusEl.className = 'connected';
    
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }

    // Register as simulator
    sendMessage({
      type: 'register',
      clientType: 'simulator'
    });
  };

  socket.onclose = () => {
    console.log('[Simulator] Disconnected. Reconnecting...');
    statusEl.textContent = 'Disconnected';
    statusEl.className = '';
    
    // Start reconnecting
    if (!reconnectInterval) {
      reconnectInterval = setInterval(connect, 2000);
    }
  };

  socket.onerror = (err) => {
    console.error('[Simulator] WebSocket error:', err);
  };

  socket.onmessage = (event) => {
    try {
      const parsedMessage = JSON.parse(event.data) as SocketMessage;
      if (parsedMessage.type === 'canvas-cast') {
        container.style.backgroundImage = `url(${parsedMessage.image})`;
        container.style.backgroundSize = 'contain';
        container.style.backgroundPosition = 'center';
        container.style.backgroundRepeat = 'no-repeat';
      }
    } catch (err) {
      console.error('[Simulator] Error processing message:', err);
    }
  };
}

function sendMessage(msg: SocketMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

// Normalize coordinate calculations
function getNormalizedCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  // Clamp between 0 and 1
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y))
  };
}

// Update coordinates text display
function updateCoordsDisplay(x: number, y: number) {
  coordinatesEl.textContent = `X: ${x.toFixed(3)}, Y: ${y.toFixed(3)}`;
}

// UI indicator management
function createIndicator(id: string, clientX: number, clientY: number) {
  const rect = container.getBoundingClientRect();
  const indicator = document.createElement('div');
  indicator.className = 'touch-indicator';
  
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  indicator.style.left = `${localX}px`;
  indicator.style.top = `${localY}px`;
  
  container.appendChild(indicator);
  activeIndicators.set(id, indicator);
}

function updateIndicator(id: string, clientX: number, clientY: number) {
  const rect = container.getBoundingClientRect();
  const indicator = activeIndicators.get(id);
  if (indicator) {
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    indicator.style.left = `${localX}px`;
    indicator.style.top = `${localY}px`;
  }
}

function removeIndicator(id: string) {
  const indicator = activeIndicators.get(id);
  if (indicator) {
    indicator.remove();
    activeIndicators.delete(id);
  }
}

// --- Gesture Event Handling ---

// 1. Mouse Events (for desktop testing)
let isMouseDown = false;

container.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  const { x, y } = getNormalizedCoords(e.clientX, e.clientY);
  updateCoordsDisplay(x, y);
  createIndicator('mouse', e.clientX, e.clientY);
  
  sendMessage({
    type: 'touch-event',
    touch: {
      id: 'mouse',
      x,
      y,
      type: 'touchstart',
      timestamp: Date.now()
    }
  });
});

window.addEventListener('mousemove', (e) => {
  if (!isMouseDown) return;
  const { x, y } = getNormalizedCoords(e.clientX, e.clientY);
  updateCoordsDisplay(x, y);
  updateIndicator('mouse', e.clientX, e.clientY);
  
  sendMessage({
    type: 'touch-event',
    touch: {
      id: 'mouse',
      x,
      y,
      type: 'touchmove',
      timestamp: Date.now()
    }
  });
});

window.addEventListener('mouseup', (e) => {
  if (!isMouseDown) return;
  isMouseDown = false;
  const { x, y } = getNormalizedCoords(e.clientX, e.clientY);
  removeIndicator('mouse');
  
  sendMessage({
    type: 'touch-event',
    touch: {
      id: 'mouse',
      x,
      y,
      type: 'touchend',
      timestamp: Date.now()
    }
  });
});

// 2. Touch Events (for mobile/tablet simulation)
container.addEventListener('touchstart', (e) => {
  e.preventDefault();
  
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const id = `touch-${touch.identifier}`;
    const { x, y } = getNormalizedCoords(touch.clientX, touch.clientY);
    
    updateCoordsDisplay(x, y);
    createIndicator(id, touch.clientX, touch.clientY);
    
    sendMessage({
      type: 'touch-event',
      touch: {
        id,
        x,
        y,
        type: 'touchstart',
        timestamp: Date.now()
      }
    });
  }
}, { passive: false });

container.addEventListener('touchmove', (e) => {
  e.preventDefault();
  
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const id = `touch-${touch.identifier}`;
    const { x, y } = getNormalizedCoords(touch.clientX, touch.clientY);
    
    updateCoordsDisplay(x, y);
    updateIndicator(id, touch.clientX, touch.clientY);
    
    sendMessage({
      type: 'touch-event',
      touch: {
        id,
        x,
        y,
        type: 'touchmove',
        timestamp: Date.now()
      }
    });
  }
}, { passive: false });

const handleTouchEnd = (e: TouchEvent) => {
  e.preventDefault();
  
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const id = `touch-${touch.identifier}`;
    const { x, y } = getNormalizedCoords(touch.clientX, touch.clientY);
    
    removeIndicator(id);
    
    sendMessage({
      type: 'touch-event',
      touch: {
        id,
        x,
        y,
        type: 'touchend',
        timestamp: Date.now()
      }
    });
  }
};

container.addEventListener('touchend', handleTouchEnd, { passive: false });
container.addEventListener('touchcancel', handleTouchEnd, { passive: false });

// Start connection
connect();

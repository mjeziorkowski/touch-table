export interface TouchPoint {
  id: string;
  x: number;  // 0.0 to 1.0
  y: number;  // 0.0 to 1.0
  type: 'touchstart' | 'touchmove' | 'touchend';
  timestamp: number;
}

export interface GamePiece {
  id: string;
  name: string;
  x: number;  // 0.0 to 1.0
  y: number;  // 0.0 to 1.0
  color: string;
  size: number;
}

export interface GameState {
  pieces: GamePiece[];
}

export type ClientType = 'renderer' | 'simulator';

export type SocketMessage =
  | { type: 'register'; clientType: ClientType }
  | { type: 'touch-event'; touch: TouchPoint }
  | { type: 'state-update'; state: GameState }
  | { type: 'request-state' }
  | { type: 'update-piece'; piece: GamePiece };

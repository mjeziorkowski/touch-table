# Game Board Tabletop Simulator

A multi-project game board tabletop simulator monorepo designed for TV displays and external IR touch frames. It consists of a 3D board rendering engine, a mobile-friendly 2D touch controller, and a central state manager.

## System Architecture

The project is managed as a **pnpm workspace** divided into four packages:

*   **`packages/types`**: Shared TypeScript declarations for coordinate payloads, game pieces, and WebSocket messages.
*   **`packages/engine`**: A Node.js + WebSocket server acting as the central broker. It handles game piece states and coordinates synchronization.
*   **`packages/renderer`**: A 3D tabletop board built with **Vue 3**, **Vite**, and **Three.js**. It renders visual lights at touch locations and supports piece interaction.
*   **`packages/touch-simulator`**: A 2D mobile-responsive web app optimized for phones (e.g., iPhone) displaying a 16:9 canvas and alignment grid. Touch points map to normalized vector values and sync in real-time.

```
┌─────────────────────────────────┐
│  Touch Simulator (Port 3001)    │
└────────────────┬────────────────┘
                 │ (1) Sends coordinates via WebSocket
                 ▼
┌─────────────────────────────────┐
│     Engine Server (Port 3000)   │
└────────────────┬────────────────┘
                 │ (2) Forwards inputs / (4) Syncs GameState
                 ▼
┌─────────────────────────────────┐
│  Three.js Renderer (Port 3002)  │
└─────────────────────────────────┘
```

---

## Required Software

To install, build, and run the simulator locally, you need the following software installed on your machine:

1.  **Node.js** (v18.0.0 or higher)
    *   *Verification*: Run `node --version` in your terminal.
2.  **pnpm** (v11.0.0 or higher)
    *   *Verification*: Run `pnpm --version` in your terminal.
    *   *Installation*: If not installed, run `npm install -g pnpm`.
3.  **Modern Web Browser** (Safari, Chrome, Firefox, or Edge)
    *   Needs to support WebGL (for the 3D Renderer) and WebSockets.

---

## Getting Started

### 1. Install Dependencies

In the root directory of the workspace, run the following command to download and cross-link all packages:

```bash
pnpm install
```

### 2. Run the Development Servers

To spin up all services concurrently (Engine, Touch Simulator, and Renderer) in development mode, run:

```bash
pnpm dev
```

The terminal will launch all dev servers parallelly:
*   **Engine Backend**: Listening on `ws://localhost:3000`
*   **Touch Simulator Client**: Available at `http://localhost:3001`
    *   *Mobile access*: The Vite terminal logs will output your local IP (e.g., `http://192.168.1.85:3001`). Open this address on your iPhone or tablet on the same Wi-Fi network.
*   **Renderer Client**: Available at `http://localhost:3002`

---

## How to Test the Loop

1.  Open the **Renderer** at `http://localhost:3002` on your main screen (e.g., a TV or computer monitor). You will see a 3D grid board with three floating discs.
2.  Open the **Touch Simulator** at `http://localhost:3001` (or on your iPhone).
3.  Ensure both display a **"Connected"** status badge in their headers.
4.  Tap and drag the colored circles on the Touch Simulator's screen.
5.  **Observe**:
    *   The 2D discs on the simulator move exactly under your touch points.
    *   The corresponding 3D cylinders slide in real-time across the Three.js board.
    *   If you refresh the Renderer client, the Engine will automatically push the last known state, restoring the pieces to their exact saved coordinates.

---

## Production Build

To compile and package the TypeScript and Vite projects for production, run:

```bash
pnpm build
```

This compiles all modules into their respective `/dist` folders inside each package.

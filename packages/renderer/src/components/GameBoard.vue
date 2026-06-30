<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as THREE from 'three';
import { GameState, TouchPoint, GamePiece } from '@touch-table/types';

interface Props {
  gameState: GameState;
  activeTouch: TouchPoint | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'piece-moved', piece: GamePiece): void;
}>();

const canvasContainer = ref<HTMLDivElement | null>(null);

// Three.js variables
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let animationFrameId: number;

// Board dimensions in 3D units
const BOARD_WIDTH = 16;
const BOARD_DEPTH = 9;

// Table plane mesh for raycasting
let boardPlane: THREE.Mesh;

// Three.js meshes
const pieceMeshes = new Map<string, THREE.Mesh>();
const touchIndicators = new Map<string, { mesh: THREE.Mesh; light: THREE.PointLight; lastActive: number }>();

// Tracking drag state
let draggedPieceId: string | null = null;

// Initialize Three.js scene
function initThree() {
  if (!canvasContainer.value) return;

  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);
  // Add dark fog for premium depth feel
  scene.fog = new THREE.FogExp2(0x0a0a0c, 0.035);

  // Camera - look down at the board from an angle
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(0, 12, 10);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasContainer.value.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  // Main directional light casting shadows
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 15, 5);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 25;
  const d = 10;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  // Subtle blue/purple fill lights for cyberpunk aesthetic
  const blueLight = new THREE.DirectionalLight(0x00f0ff, 0.3);
  blueLight.position.set(-8, 5, -4);
  scene.add(blueLight);

  const magentaLight = new THREE.DirectionalLight(0xff00ff, 0.2);
  magentaLight.position.set(8, 5, 4);
  scene.add(magentaLight);

  // Create Board (16:9 Tabletop)
  const boardGeo = new THREE.BoxGeometry(BOARD_WIDTH, 0.5, BOARD_DEPTH);
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0x18181c,
    roughness: 0.4,
    metalness: 0.1,
  });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.y = -0.25; // Align top of board to Y = 0
  board.receiveShadow = true;
  scene.add(board);

  // Create invisible plane exactly at Y=0 for raycasting
  const planeGeo = new THREE.PlaneGeometry(BOARD_WIDTH * 2, BOARD_DEPTH * 2);
  planeGeo.rotateX(-Math.PI / 2);
  const planeMat = new THREE.MeshBasicMaterial({ visible: false });
  boardPlane = new THREE.Mesh(planeGeo, planeMat);
  scene.add(boardPlane);

  // Draw Grid overlay on board
  const gridHelper = new THREE.GridHelper(BOARD_WIDTH, 16, 0x00f0ff, 0x33333b);
  gridHelper.position.y = 0.01;
  // Scale gridHelper to match 16:9 aspect ratio plane
  gridHelper.scale.set(1, 1, BOARD_DEPTH / BOARD_WIDTH);
  scene.add(gridHelper);

  // Render initial game pieces
  updatePieces(props.gameState.pieces);

  // Window resizing
  window.addEventListener('resize', onWindowResize);

  // Animation Loop
  animate();
}

// Convert normalized 2D coordinates [0..1] to 3D board coordinates
function normalizedTo3D(x: number, y: number): THREE.Vector3 {
  const threeX = (x - 0.5) * BOARD_WIDTH;
  const threeZ = (y - 0.5) * BOARD_DEPTH;
  return new THREE.Vector3(threeX, 0, threeZ);
}

// Convert 3D board coordinates back to normalized 2D [0..1] coordinates
function threeDToNormalized(vec: THREE.Vector3): { x: number; y: number } {
  const normX = (vec.x / BOARD_WIDTH) + 0.5;
  const normY = (vec.z / BOARD_DEPTH) + 0.5;
  return {
    x: Math.max(0, Math.min(1, normX)),
    y: Math.max(0, Math.min(1, normY))
  };
}

// Handle updates to Game State pieces
function updatePieces(pieces: GamePiece[]) {
  if (!scene) return;

  // Track which IDs are currently in state
  const stateIds = new Set(pieces.map(p => p.id));

  // Remove meshes that are no longer in state
  for (const [id, mesh] of pieceMeshes.entries()) {
    if (!stateIds.has(id)) {
      scene.remove(mesh);
      pieceMeshes.delete(id);
    }
  }

  // Update or Create meshes
  pieces.forEach(piece => {
    let mesh = pieceMeshes.get(piece.id);
    const targetPos = normalizedTo3D(piece.x, piece.y);
    targetPos.y = 0.25; // piece height offset

    if (!mesh) {
      // Create new circular checkers/discs
      const geom = new THREE.CylinderGeometry(piece.size * BOARD_WIDTH, piece.size * BOARD_WIDTH, 0.4, 32);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(piece.color),
        roughness: 0.2,
        metalness: 0.5,
      });
      mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = piece.id;
      scene.add(mesh);
      pieceMeshes.set(piece.id, mesh);
    } else {
      // Update color if changed
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.color.getHexString() !== piece.color.replace('#', '').toLowerCase()) {
        mat.color.set(piece.color);
      }
    }

    // Smoothly interpolate position to target, or snap if far
    if (draggedPieceId !== piece.id) {
      mesh.position.lerp(targetPos, 0.2); // Smooth movement interpolation
    } else {
      // If we are actively dragging it locally, let the local dragging control it
      mesh.position.copy(targetPos);
    }
  });
}

// Process incoming touch events from the simulator
function processTouch(touch: TouchPoint) {
  if (!scene) return;

  const touchPos = normalizedTo3D(touch.x, touch.y);
  
  // 1. Manage visual touch indicators (e.g. glowing rings/lasers pointing at touch coordinate)
  let indicator = touchIndicators.get(touch.id);
  
  if (touch.type === 'touchstart' || touch.type === 'touchmove') {
    if (!indicator) {
      // Create ring
      const ringGeo = new THREE.RingGeometry(0.1, 0.15, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.position.copy(touchPos);
      mesh.position.y = 0.02; // sit just above board grid
      scene.add(mesh);

      // Create glowing light point
      const light = new THREE.PointLight(0x00f0ff, 1.5, 3);
      light.position.copy(touchPos);
      light.position.y = 0.5;
      scene.add(light);

      indicator = { mesh, light, lastActive: Date.now() };
      touchIndicators.set(touch.id, indicator);
    } else {
      indicator.mesh.position.copy(touchPos);
      indicator.mesh.position.y = 0.02;
      indicator.light.position.copy(touchPos);
      indicator.light.position.y = 0.5;
      indicator.lastActive = Date.now();
    }
  }

  // 2. Perform Raycasting on pieces for dragging
  if (touch.type === 'touchstart') {
    // Perform hit testing against our piece meshes
    const raycaster = new THREE.Raycaster();
    
    // Create rays pointing down from overhead
    // (Since simulator passes 2D normalized coordinates, we project a vertical ray down at that spot)
    const rayOrigin = new THREE.Vector3(touchPos.x, 10, touchPos.z);
    const rayDir = new THREE.Vector3(0, -1, 0);
    raycaster.set(rayOrigin, rayDir);

    const meshes = Array.from(pieceMeshes.values());
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      draggedPieceId = intersects[0].object.name;
      console.log(`[GameBoard] Dragging piece: ${draggedPieceId}`);
    }
  } else if (touch.type === 'touchmove' && draggedPieceId) {
    // Move dragged piece
    const piece = props.gameState.pieces.find(p => p.id === draggedPieceId);
    if (piece) {
      const updatedPiece: GamePiece = {
        ...piece,
        x: touch.x,
        y: touch.y
      };
      
      // Update local mesh immediately for zero-latency dragging
      const mesh = pieceMeshes.get(draggedPieceId);
      if (mesh) {
        mesh.position.copy(normalizedTo3D(touch.x, touch.y));
        mesh.position.y = 0.25;
      }
      
      // Emit update back to app (which forwards to Engine)
      emit('piece-moved', updatedPiece);
    }
  } else if (touch.type === 'touchend') {
    if (draggedPieceId) {
      console.log(`[GameBoard] Stopped dragging piece: ${draggedPieceId}`);
      draggedPieceId = null;
    }

    // Clean up indicator
    const ind = touchIndicators.get(touch.id);
    if (ind) {
      scene.remove(ind.mesh);
      scene.remove(ind.light);
      touchIndicators.delete(touch.id);
    }
  }
}

// Watch props
watch(() => props.gameState.pieces, (newPieces) => {
  updatePieces(newPieces);
}, { deep: true });

watch(() => props.activeTouch, (newTouch) => {
  if (newTouch) {
    processTouch(newTouch);
  }
});

function animate() {
  animationFrameId = requestAnimationFrame(animate);

  // Visual effects: rotate or float active touch indicators
  const now = Date.now();
  for (const [id, ind] of touchIndicators.entries()) {
    ind.mesh.rotation.y += 0.05;
    // Pulse light intensity slightly
    ind.light.intensity = 1.0 + Math.sin(now * 0.01) * 0.5;
    
    // Auto-prune stale indicators if touchend was missed
    if (now - ind.lastActive > 2000) {
      scene.remove(ind.mesh);
      scene.remove(ind.light);
      touchIndicators.delete(id);
    }
  }

  // Smoothly float the checkers slightly for premium feel
  pieceMeshes.forEach((mesh, id) => {
    // If not dragging, add a subtle floating animation using sine wave
    if (draggedPieceId !== id) {
      const floatOffset = Math.sin(now * 0.003 + id.charCodeAt(0)) * 0.03;
      mesh.position.y = 0.25 + floatOffset;
    }
  });

  renderer.render(scene, camera);
}

function onWindowResize() {
  if (!canvasContainer.value || !renderer || !camera) return;
  const width = canvasContainer.value.clientWidth;
  const height = canvasContainer.value.clientHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// Local raycasting from Renderer viewport (for mouse debugging in the renderer window itself)
function onRendererMouseDown(e: MouseEvent) {
  // Only handle click dragging if not currently driven by simulator
  if (!canvasContainer.value) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

  // Test piece intersection first
  const meshes = Array.from(pieceMeshes.values());
  const intersects = raycaster.intersectObjects(meshes);

  if (intersects.length > 0) {
    draggedPieceId = intersects[0].object.name;
    
    // Listen for drag movements locally
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!draggedPieceId) return;

      const innerNdcX = ((moveEvent.clientX - rect.left) / rect.width) * 2 - 1;
      const innerNdcY = -((moveEvent.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(new THREE.Vector2(innerNdcX, innerNdcY), camera);
      const planeIntersects = raycaster.intersectObject(boardPlane);

      if (planeIntersects.length > 0) {
        const point = planeIntersects[0].point;
        const norm = threeDToNormalized(point);
        
        const piece = props.gameState.pieces.find(p => p.id === draggedPieceId);
        if (piece) {
          emit('piece-moved', {
            ...piece,
            x: norm.x,
            y: norm.y
          });
        }
      }
    };

    const onMouseUp = () => {
      draggedPieceId = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
}

onMounted(() => {
  initThree();
  
  if (canvasContainer.value) {
    canvasContainer.value.addEventListener('mousedown', onRendererMouseDown);
  }
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId);
  window.removeEventListener('resize', onWindowResize);
  
  if (canvasContainer.value) {
    canvasContainer.value.removeEventListener('mousedown', onRendererMouseDown);
  }

  // Dispose three objects
  pieceMeshes.forEach(mesh => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => m.dispose());
    } else {
      mesh.material.dispose();
    }
  });

  if (renderer) {
    renderer.dispose();
  }
});
</script>

<template>
  <div ref="canvasContainer" class="canvas-container"></div>
</template>

<style scoped>
.canvas-container {
  width: 100%;
  height: 100%;
  outline: none;
}
</style>

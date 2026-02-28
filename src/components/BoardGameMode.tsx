import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, useGLTF } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft } from 'lucide-react';
import {
  BoardSquare,
  BoardGameState,
  generateBoard,
  calculateRolls,
} from '@/types/boardGame';
import { AnimalType } from '@/types/game';
import { SkyBackground } from '@/components/SkyBackground';
import { FogConfig } from '@/game/FogConfig';
import * as THREE from 'three';

// --- Constants ---
const BOARD_RADIUS = 7;

function getSquarePosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return [
    Math.cos(angle) * BOARD_RADIUS,
    0,
    Math.sin(angle) * BOARD_RADIUS,
  ];
}

// --- 3D Model Components ---

function GrassPlatform({ position, type, isPlayerHere }: {
  position: [number, number, number];
  type: BoardSquare['type'];
  isPlayerHere: boolean;
}) {
  const { scene } = useGLTF('/models/Grass_Platform.glb');
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.visible = true;
    c.traverse((child) => { child.visible = true; });
    return c;
  }, [scene]);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const color = getSquareColor(type);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
          mat.color.lerp(new THREE.Color(color), 0.35);
          if (isPlayerHere) {
            mat.emissive = new THREE.Color('#ffffff');
            mat.emissiveIntensity = 0.15;
          }
          mesh.material = mat;
        }
      }
    });
  }, [cloned, type, isPlayerHere]);

  return (
    <group ref={groupRef} position={position}>
      <primitive object={cloned} scale={1.5} />
    </group>
  );
}

function FarmCenter() {
  const { scene } = useGLTF('/models/Farm.glb');
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.visible = true;
    c.traverse((child) => { child.visible = true; });
    return c;
  }, [scene]);
  return (
    <group position={[0, 0, 0]}>
      <primitive object={cloned} scale={0.02} />
    </group>
  );
}

function TreeDecoration({ position, variant }: {
  position: [number, number, number];
  variant: 'tree' | 'tree1';
}) {
  const model = variant === 'tree' ? '/models/Tree.glb' : '/models/Tree_1.glb';
  const treeScale = variant === 'tree' ? 0.004 : 0.45;
  const { scene } = useGLTF(model);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.visible = true;
    c.traverse((child) => { child.visible = true; });
    return c;
  }, [scene]);
  return (
    <group position={position}>
      <primitive object={cloned} scale={treeScale} />
    </group>
  );
}

// Dice face rotations - oriented so the result face points toward camera (+Z)
// with a slight tilt to show depth without revealing extra faces
const DICE_FACE_ROTATIONS: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [Math.PI / 2, 0, 0],
  3: [Math.PI, 0, 0],
  4: [-Math.PI / 2, 0, 0],
  5: [0, Math.PI / 2, 0],
  6: [0, -Math.PI / 2, 0],
};

// Dice that floats in front of the camera inside the main scene
// Animated spinning dice rendered in an overlay Canvas
function SpinningDice({ value, isRolling }: { value: number; isRolling: boolean }) {
  const { scene } = useGLTF('/models/Dice_2.glb');
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.visible = true;
    c.traverse((child) => { child.visible = true; });
    return c;
  }, [scene]);

  const groupRef = useRef<THREE.Group>(null);
  const spinSpeed = useRef({ x: 8, y: 10 });
  const settled = useRef(false);
  const targetEuler = useRef(new THREE.Euler());

  // When rolling stops, set target rotation for the final face
  useEffect(() => {
    if (!isRolling) {
      const rot = DICE_FACE_ROTATIONS[value] || [0, 0, 0];
      targetEuler.current.set(rot[0], rot[1], rot[2]);
      settled.current = false;
    } else {
      // Randomize spin direction each roll
      spinSpeed.current = {
        x: (5 + Math.random() * 6) * (Math.random() > 0.5 ? 1 : -1),
        y: (6 + Math.random() * 7) * (Math.random() > 0.5 ? 1 : -1),
      };
      settled.current = false;
    }
  }, [isRolling, value]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const g = groupRef.current;

    if (isRolling) {
      // Free spin
      g.rotation.x += spinSpeed.current.x * delta;
      g.rotation.y += spinSpeed.current.y * delta;
    } else if (!settled.current) {
      // Ease toward target rotation
      const tx = targetEuler.current.x;
      const ty = targetEuler.current.y;
      const tz = targetEuler.current.z;
      const lerpFactor = 1 - Math.pow(0.02, delta); // smooth ease-out
      g.rotation.x += (tx - g.rotation.x) * lerpFactor;
      g.rotation.y += (ty - g.rotation.y) * lerpFactor;
      g.rotation.z += (tz - g.rotation.z) * lerpFactor;

      const dist = Math.abs(g.rotation.x - tx) + Math.abs(g.rotation.y - ty) + Math.abs(g.rotation.z - tz);
      if (dist < 0.01) {
        g.rotation.set(tx, ty, tz);
        settled.current = true;
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={cloned} scale={0.45} />
    </group>
  );
}

function DiceOverlay({ visible, value, isRolling }: { visible: boolean; value: number; isRolling: boolean }) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 9999 }}
    >
      <div className="w-80 h-80">
        <Canvas
          camera={{ position: [0.5, 0.5, 12], fov: 15 }}
          style={{ background: 'transparent' }}
          gl={{ alpha: true }}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 3, 4]} intensity={1} />
          <SpinningDice value={value} isRolling={isRolling} />
        </Canvas>
      </div>
    </div>
  );
}

// Map animal type to GLB model and board-appropriate scale
function getAnimalModel(animalType: AnimalType): { path: string; scale: number; yOffset: number } {
  switch (animalType) {
    case 'pig': return { path: '/models/Pig.glb', scale: 0.002, yOffset: 0.05 };
    case 'cow': return { path: '/models/Cow.glb', scale: 0.12, yOffset: 0.05 };
    case 'bird': return { path: '/models/Hen.glb', scale: 0.0018, yOffset: 0.05 };
    default: return { path: '/models/Hen.glb', scale: 0.0018, yOffset: 0.05 };
  }
}

function PlayerToken({ position, hopSequence, onHopComplete, total, animalType }: {
  position: number;
  hopSequence: number[] | null;
  onHopComplete: () => void;
  total: number;
  animalType: AnimalType;
}) {
  const { path, scale, yOffset } = getAnimalModel(animalType);
  const { scene } = useGLTF(path);
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.visible = true;
    c.traverse((child) => {
      child.visible = true;
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true;
        (child as THREE.Mesh).receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  const meshRef = useRef<THREE.Group>(null);
  const hopRef = useRef<{
    queue: number[];
    fromPos: [number, number, number];
    toPos: [number, number, number];
    progress: number;
    hopping: boolean;
    startIdx: number;
    seqLen: number;
  }>({ queue: [], fromPos: [0, 0, 0], toPos: [0, 0, 0], progress: 0, hopping: false, startIdx: 0, seqLen: 0 });

  useEffect(() => {
    if (hopSequence && hopSequence.length > 0) {
      hopRef.current.queue = [...hopSequence];
      hopRef.current.startIdx = position;
      hopRef.current.seqLen = hopSequence.length;
      hopRef.current.hopping = false;
    }
  }, [hopSequence]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const g = meshRef.current;
    const h = hopRef.current;

    if (!h.hopping && h.queue.length > 0) {
      const hopsCompleted = h.seqLen - h.queue.length;
      const prevIdx = hopsCompleted === 0 ? h.startIdx : (hopSequence ?? [])[hopsCompleted - 1];
      const nextIdx = h.queue[0];
      h.fromPos = getSquarePosition(prevIdx, total);
      h.toPos = getSquarePosition(nextIdx, total);
      h.progress = 0;
      h.hopping = true;
    }

    if (h.hopping) {
      h.progress += delta * 3.0;
      const t = Math.min(h.progress, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const x = h.fromPos[0] + (h.toPos[0] - h.fromPos[0]) * eased;
      const z = h.fromPos[2] + (h.toPos[2] - h.fromPos[2]) * eased;
      const arcHeight = 0.3;
      const y = 0.35 + yOffset + arcHeight * 4 * t * (1 - t);

      g.position.set(x, y, z);

      // Face movement direction
      if (t < 0.95) {
        const dx = h.toPos[0] - h.fromPos[0];
        const dz = h.toPos[2] - h.fromPos[2];
        const angle = Math.atan2(dx, dz);
        g.rotation.y = angle;
      }

      // Squash & stretch
      const stretchY = 1 + 0.2 * Math.sin(t * Math.PI);
      g.scale.set(scale / Math.sqrt(stretchY), scale * stretchY, scale / Math.sqrt(stretchY));

      if (t >= 1) {
        h.hopping = false;
        h.queue.shift();
        g.scale.set(scale, scale, scale);
        g.position.set(h.toPos[0], 0.3 + yOffset, h.toPos[2]);
        if (h.queue.length === 0) {
          onHopComplete();
        }
      }
    } else if (h.queue.length === 0) {
      const tp = getSquarePosition(position, total);
      g.position.x += (tp[0] - g.position.x) * 0.08;
      g.position.z += (tp[2] - g.position.z) * 0.08;
      g.position.y = 0.35 + yOffset;
      g.scale.set(scale, scale, scale);
    }
  });

  const startPos = getSquarePosition(position, total);
  // Initial facing: toward next tile on the path
  const nextPos = getSquarePosition((position + 1) % total, total);
  const initAngle = Math.atan2(nextPos[0] - startPos[0], nextPos[2] - startPos[2]);

  return (
    <group ref={meshRef} position={[startPos[0], 0.3 + yOffset, startPos[2]]} scale={[scale, scale, scale]} rotation={[0, initAngle, 0]}>
      <primitive object={cloned} />
    </group>
  );
}

function BoardPath({ total }: { total: number }) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= total; i++) {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    points.push(new THREE.Vector3(
      Math.cos(angle) * BOARD_RADIUS,
      0.02,
      Math.sin(angle) * BOARD_RADIUS
    ));
  }
  const curve = new THREE.CatmullRomCurve3(points, true);
  const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.12, 8, true);

  return (
    <mesh geometry={tubeGeo}>
      <meshStandardMaterial color="#D7CCC8" />
    </mesh>
  );
}

function getSquareColor(type: BoardSquare['type']): string {
  switch (type) {
    case 'feed': return '#E91E8C';       // hot pink bowl (like Treat)
    case 'stars': return '#FF9800';      // warm orange bowl
    case 'extra_roll': return '#9C27B0'; // deep purple
    case 'unlock_animal': return '#E040FB'; // magenta/fuchsia
    case 'empty': return '#F06292';      // medium pink
  }
}

function SceneryTrees() {
  const treePositions: { pos: [number, number, number]; variant: 'tree' | 'tree1' }[] = [
    { pos: [-14, 0, -8], variant: 'tree' },
    { pos: [14, 0, -6], variant: 'tree1' },
    { pos: [-12, 0, 10], variant: 'tree1' },
    { pos: [13, 0, 9], variant: 'tree' },
    { pos: [-6, 0, -14], variant: 'tree' },
    { pos: [7, 0, -13], variant: 'tree1' },
    { pos: [-15, 0, 2], variant: 'tree1' },
    { pos: [15, 0, 1], variant: 'tree' },
  ];

  return (
    <>
      {treePositions.map((t, i) => (
        <TreeDecoration key={i} position={t.pos} variant={t.variant} />
      ))}
    </>
  );
}

function BehindCamera({ playerPosition, total }: { playerPosition: number; total: number }) {
  const { camera } = useThree();
  
  // Set initial camera position behind animal
  useEffect(() => {
    const pos = getSquarePosition(playerPosition, total);
    const nextPos = getSquarePosition((playerPosition + 1) % total, total);
    const dx = nextPos[0] - pos[0];
    const dz = nextPos[2] - pos[2];
    const len = Math.sqrt(dx * dx + dz * dz);
    const dirX = dx / len;
    const dirZ = dz / len;
    
    const camDist = 3;
    const camHeight = 1.5;
    camera.position.set(
      pos[0] - dirX * camDist,
      camHeight,
      pos[2] - dirZ * camDist
    );
    camera.lookAt(pos[0], 0.4, pos[2]);
  }, [playerPosition, total, camera]);

  // Log camera position on every frame so user can find their ideal angle
  useFrame(() => {
    // Log every 2 seconds
    if (Math.floor(Date.now() / 2000) !== (BehindCamera as any)._lastLog) {
      (BehindCamera as any)._lastLog = Math.floor(Date.now() / 2000);
      console.log(`📷 Camera pos: [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}], rotation: [${camera.rotation.x.toFixed(2)}, ${camera.rotation.y.toFixed(2)}, ${camera.rotation.z.toFixed(2)}]`);
    }
  });
  
  return null;
}

function BoardScene({ board, playerPosition, hopSequence, onHopComplete, animalType }: {
  board: BoardSquare[];
  playerPosition: number;
  hopSequence: number[] | null;
  onHopComplete: () => void;
  animalType: AnimalType;
}) {
  return (
    <>
      <ambientLight intensity={0.9} color="#FFE4CC" />
      <directionalLight position={[0, 50, -25]} intensity={1.75} color="#FFA050" />
      <directionalLight position={[0, 15, 25]} intensity={0.45} color="#FFE8D0" />
      <hemisphereLight args={['#FFB870', '#9B7B5A', 0.55]} />

      {/* Sky and fog */}
      <SkyBackground />
      <fogExp2 attach="fog" args={[FogConfig.COLOR_HEX, 0.025]} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <circleGeometry args={[22, 48]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      {/* Farm in center */}
      <FarmCenter />

      {/* Path */}
      <BoardPath total={board.length} />

      {/* Grass platform squares */}
      {board.map((sq, i) => (
        <group key={sq.id}>
          <GrassPlatform
            position={getSquarePosition(i, board.length)}
            type={sq.type}
            isPlayerHere={i === playerPosition}
          />
          <Text
            position={[
              getSquarePosition(i, board.length)[0],
              0.7,
              getSquarePosition(i, board.length)[2],
            ]}
            fontSize={0.4}
            anchorX="center"
            anchorY="middle"
          >
            {sq.emoji}
          </Text>
        </group>
      ))}

      {/* Player */}
      <PlayerToken
        position={playerPosition}
        hopSequence={hopSequence}
        onHopComplete={onHopComplete}
        total={board.length}
        animalType={animalType}
      />

      {/* Scenery trees */}
      <SceneryTrees />

      {/* Camera - OrbitControls enabled so you can position it, logs position */}
      <BehindCamera playerPosition={playerPosition} total={board.length} />
      <OrbitControls enablePan={true} enableZoom={true} />
    </>
  );
}

// --- Main Component ---

interface BoardGameModeProps {
  animalType: AnimalType;
  animalEmoji: string;
  goldMedals: number;
  onBack: () => void;
  onStarsEarned: (stars: number) => void;
  onFeedSent: () => void;
}

export const BoardGameMode = ({
  animalType,
  animalEmoji,
  goldMedals,
  onBack,
  onStarsEarned,
  onFeedSent,
}: BoardGameModeProps) => {
  const [board] = useState(() => generateBoard());
  const [state, setState] = useState<BoardGameState>(() => ({
    playerPosition: 0,
    rollsRemaining: calculateRolls(goldMedals),
    feedBag: { progress: 0, totalSent: 0 },
    starsEarned: 0,
    lastRoll: null,
    isRolling: false,
    isMoving: false,
    rewardMessage: null,
    animalsUnlocked: [],
  }));
  const [highlightedSquare, setHighlightedSquare] = useState<number | null>(null);
  const [diceDisplay, setDiceDisplay] = useState(1);
  const [diceVisible, setDiceVisible] = useState(false);
  const [hopSequence, setHopSequence] = useState<number[] | null>(null);
  const pendingRewardPos = useRef<number | null>(null);
  const rollingInterval = useRef<NodeJS.Timeout | null>(null);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  const applyReward = useCallback((pos: number) => {
    const square = board[pos];
    setState(s => {
      const next = { ...s };
      switch (square.type) {
        case 'feed': {
          const newProgress = s.feedBag.progress + square.value;
          if (newProgress >= 100) {
            next.feedBag = { progress: newProgress - 100, totalSent: s.feedBag.totalSent + 1 };
            next.rewardMessage = `🎉 Feed bag sent! (${next.feedBag.totalSent} total)`;
            onFeedSent();
          } else {
            next.feedBag = { ...s.feedBag, progress: newProgress };
            next.rewardMessage = `🥣 +${square.value}% feed collected!`;
          }
          break;
        }
        case 'stars': {
          next.starsEarned += square.value;
          next.rewardMessage = `⭐ +${square.value} stars!`;
          onStarsEarned(square.value);
          break;
        }
        case 'extra_roll': {
          next.rollsRemaining += square.value;
          next.rewardMessage = `🎲 +${square.value} extra roll!`;
          break;
        }
        case 'unlock_animal': {
          next.rewardMessage = `🐾 New animal friend unlocked!`;
          next.animalsUnlocked = [...s.animalsUnlocked, 'new_animal'];
          break;
        }
        case 'empty': {
          next.rewardMessage = `🌿 A peaceful spot...`;
          break;
        }
      }
      return next;
    });
  }, [board, onStarsEarned, onFeedSent]);

  const handleHopComplete = useCallback(() => {
    const pos = pendingRewardPos.current;
    if (pos !== null) {
      applyReward(pos);
      setState(s => ({ ...s, playerPosition: pos, isMoving: false }));
      setHighlightedSquare(null);
      pendingRewardPos.current = null;
    }
    setHopSequence(null);
    hideTimeout.current = setTimeout(() => setDiceVisible(false), 2000);
  }, [applyReward]);

  const handleRoll = useCallback(() => {
    if (state.rollsRemaining <= 0 || state.isRolling || state.isMoving) return;

    if (hideTimeout.current) clearTimeout(hideTimeout.current);

    setState(s => ({ ...s, isRolling: true, rewardMessage: null }));
    setDiceVisible(true);

    let ticks = 0;
    rollingInterval.current = setInterval(() => {
      setDiceDisplay(Math.floor(Math.random() * 6) + 1);
      ticks++;
      if (ticks >= 15) {
        if (rollingInterval.current) clearInterval(rollingInterval.current);

        const finalRoll = Math.floor(Math.random() * 6) + 1;
        setDiceDisplay(finalRoll);

        // Build hop sequence: each intermediate square
        const steps: number[] = [];
        for (let i = 1; i <= finalRoll; i++) {
          steps.push((state.playerPosition + i) % board.length);
        }
        const newPosition = steps[steps.length - 1];
        setHighlightedSquare(newPosition);
        pendingRewardPos.current = newPosition;

        setState(s => ({
          ...s,
          lastRoll: finalRoll,
          isRolling: false,
          isMoving: true,
          rollsRemaining: s.rollsRemaining - 1,
        }));

        // Start hopping after a brief pause
        setTimeout(() => {
          setHopSequence(steps);
        }, 300);
      }
    }, 80);
  }, [state.rollsRemaining, state.isRolling, state.isMoving, state.playerPosition, board]);


  useEffect(() => {
    return () => {
      if (rollingInterval.current) clearInterval(rollingInterval.current);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  const gameOver = state.rollsRemaining <= 0 && !state.isRolling && !state.isMoving;

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-10 p-3 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex items-center gap-4 text-sm font-medium">
          <span>🎲 {state.rollsRemaining} rolls</span>
          <span>⭐ {state.starsEarned}</span>
        </div>
      </div>

      {/* 3D Board */}
      <div className="flex-1">
        <Canvas camera={{ position: [0, 3, -10], fov: 30 }}>
          <BoardScene
            board={board}
            playerPosition={state.playerPosition}
            hopSequence={hopSequence}
            onHopComplete={handleHopComplete}
            animalType={animalType}
          />
        </Canvas>
      </div>

      {/* Dice overlay - separate Canvas on top */}
      <DiceOverlay visible={diceVisible} value={state.lastRoll ?? diceDisplay} isRolling={state.isRolling} />
      

      {/* Bottom HUD */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 space-y-3">
        {/* Feed bag progress */}
        <div className="bg-card/90 backdrop-blur rounded-xl p-3 shadow-warm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              🥣 Feed Bag ({state.feedBag.totalSent} sent)
            </span>
            <span className="text-xs font-bold text-foreground">
              {Math.round(state.feedBag.progress)}%
            </span>
          </div>
          <Progress value={state.feedBag.progress} className="h-3" />
        </div>

        {/* Reward message */}
        {state.rewardMessage && (
          <div className="text-center py-2 text-lg font-bold text-foreground animate-fade-in">
            {state.rewardMessage}
          </div>
        )}

        {/* Dice roll button */}
        {!gameOver ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="sunset"
              size="xl"
              onClick={handleRoll}
              disabled={state.isRolling || state.isMoving || state.rollsRemaining <= 0}
              className="min-w-48"
            >
              {state.isRolling ? 'Rolling...' : `Roll! (${state.rollsRemaining} left)`}
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-lg font-bold text-foreground">
              🎉 Session complete!
            </p>
            <p className="text-sm text-muted-foreground">
              ⭐ {state.starsEarned} stars earned · 🥣 {state.feedBag.totalSent} bags sent
            </p>
            <Button variant="sunset" size="lg" onClick={onBack}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

// Preload models
useGLTF.preload('/models/Grass_Platform.glb');
useGLTF.preload('/models/Tree.glb');
useGLTF.preload('/models/Tree_1.glb');
useGLTF.preload('/models/Farm.glb');
useGLTF.preload('/models/Dice_2.glb');

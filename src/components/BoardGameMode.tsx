import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
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
  const cloned = useMemo(() => scene.clone(), [scene]);
  const groupRef = useRef<THREE.Group>(null);

  // Tint the platform based on square type
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
  const cloned = useMemo(() => scene.clone(), [scene]);
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
  const treeScale = variant === 'tree' ? 0.08 : 0.15;
  const { scene } = useGLTF(model);
  const cloned = useMemo(() => scene.clone(), [scene]);
  return (
    <group position={position}>
      <primitive object={cloned} scale={treeScale} />
    </group>
  );
}

function DiceModel({ rolling, value }: { rolling: boolean; value: number }) {
  const { scene } = useGLTF('/models/Dice.glb');
  const cloned = useMemo(() => scene.clone(), [scene]);
  const groupRef = useRef<THREE.Group>(null);

  // Map dice value to rotation (approximate face rotations for a standard die)
  const targetRotations: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    2: [Math.PI / 2, 0, 0],
    3: [0, 0, -Math.PI / 2],
    4: [0, 0, Math.PI / 2],
    5: [-Math.PI / 2, 0, 0],
    6: [Math.PI, 0, 0],
  };

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (rolling) {
      groupRef.current.rotation.x += delta * 8;
      groupRef.current.rotation.y += delta * 6;
      groupRef.current.rotation.z += delta * 4;
    } else {
      const target = targetRotations[value] || [0, 0, 0];
      groupRef.current.rotation.x += (target[0] - groupRef.current.rotation.x) * 0.1;
      groupRef.current.rotation.y += (target[1] - groupRef.current.rotation.y) * 0.1;
      groupRef.current.rotation.z += (target[2] - groupRef.current.rotation.z) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[0, 3.5, 0]}>
      <primitive object={cloned} scale={0.3} />
    </group>
  );
}

function PlayerToken({ position, total, animalEmoji }: {
  position: number;
  total: number;
  animalEmoji: string;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const targetPos = getSquarePosition(position, total);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.x += (targetPos[0] - meshRef.current.position.x) * 0.08;
      meshRef.current.position.z += (targetPos[2] - meshRef.current.position.z) * 0.08;
      meshRef.current.position.y = 0.8 + Math.sin(Date.now() * 0.003) * 0.1;
    }
  });

  return (
    <group ref={meshRef} position={[targetPos[0], 0.8, targetPos[2]]}>
      <mesh>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color="#FF9800" />
      </mesh>
      <Text position={[0, 0.5, 0]} fontSize={0.4} anchorX="center" anchorY="middle">
        {animalEmoji}
      </Text>
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
    case 'feed': return '#8BC34A';
    case 'stars': return '#FFD700';
    case 'extra_roll': return '#E91E63';
    case 'unlock_animal': return '#9C27B0';
    case 'empty': return '#A5D6A7';
  }
}

// Tree positions scattered around the board
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

function BoardScene({ board, playerPosition, animalEmoji, highlightedSquare, isRolling, diceValue }: {
  board: BoardSquare[];
  playerPosition: number;
  animalEmoji: string;
  highlightedSquare: number | null;
  isRolling: boolean;
  diceValue: number;
}) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 12, 5]} intensity={0.9} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <circleGeometry args={[22, 48]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      {/* Farm in center */}
      <FarmCenter />

      {/* 3D Dice floating above center */}
      <DiceModel rolling={isRolling} value={diceValue} />

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
      <PlayerToken position={playerPosition} total={board.length} animalEmoji={animalEmoji} />

      {/* Scenery trees */}
      <SceneryTrees />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 3}
        target={[0, 0, 0]}
      />
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
  const rollingInterval = useRef<NodeJS.Timeout | null>(null);

  const handleRoll = useCallback(() => {
    if (state.rollsRemaining <= 0 || state.isRolling || state.isMoving) return;

    setState(s => ({ ...s, isRolling: true, rewardMessage: null }));

    let ticks = 0;
    rollingInterval.current = setInterval(() => {
      setDiceDisplay(Math.floor(Math.random() * 6) + 1);
      ticks++;
      if (ticks >= 15) {
        if (rollingInterval.current) clearInterval(rollingInterval.current);

        const finalRoll = Math.floor(Math.random() * 6) + 1;
        setDiceDisplay(finalRoll);

        const newPosition = (state.playerPosition + finalRoll) % board.length;
        setHighlightedSquare(newPosition);

        setState(s => ({
          ...s,
          lastRoll: finalRoll,
          isRolling: false,
          isMoving: true,
          rollsRemaining: s.rollsRemaining - 1,
        }));

        setTimeout(() => {
          applyReward(newPosition);
          setState(s => ({
            ...s,
            playerPosition: newPosition,
            isMoving: false,
          }));
          setHighlightedSquare(null);
        }, 1200);
      }
    }, 80);
  }, [state.rollsRemaining, state.isRolling, state.isMoving, state.playerPosition, board]);

  const applyReward = useCallback((position: number) => {
    const square = board[position];

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

  useEffect(() => {
    return () => {
      if (rollingInterval.current) clearInterval(rollingInterval.current);
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
        <Canvas camera={{ position: [0, 14, 10], fov: 45 }}>
          <BoardScene
            board={board}
            playerPosition={state.playerPosition}
            animalEmoji={animalEmoji}
            highlightedSquare={highlightedSquare}
            isRolling={state.isRolling}
            diceValue={state.lastRoll ?? diceDisplay}
          />
        </Canvas>
      </div>

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
useGLTF.preload('/models/Dice.glb');
useGLTF.preload('/models/Grass_Platform.glb');
useGLTF.preload('/models/Tree.glb');
useGLTF.preload('/models/Tree_1.glb');
useGLTF.preload('/models/Farm.glb');

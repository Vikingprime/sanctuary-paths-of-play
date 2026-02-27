import { useState, useCallback, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Environment } from '@react-three/drei';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react';
import {
  BoardSquare,
  BoardGameState,
  generateBoard,
  calculateRolls,
} from '@/types/boardGame';
import { AnimalType } from '@/types/game';
import * as THREE from 'three';

// --- 3D Board Components ---

const BOARD_RADIUS = 6;

function getSquarePosition(index: number, total: number): [number, number, number] {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return [
    Math.cos(angle) * BOARD_RADIUS,
    0.05,
    Math.sin(angle) * BOARD_RADIUS,
  ];
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

function BoardSquare3D({ square, index, total, isPlayerHere, isHighlighted }: {
  square: BoardSquare;
  index: number;
  total: number;
  isPlayerHere: boolean;
  isHighlighted: boolean;
}) {
  const pos = getSquarePosition(index, total);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current && isHighlighted) {
      meshRef.current.position.y = 0.05 + Math.sin(Date.now() * 0.005) * 0.1;
    }
  });

  return (
    <group position={pos}>
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.1, 16]} />
        <meshStandardMaterial
          color={getSquareColor(square.type)}
          emissive={isPlayerHere ? '#ffffff' : '#000000'}
          emissiveIntensity={isPlayerHere ? 0.3 : 0}
        />
      </mesh>
      {/* Square label */}
      <Text
        position={[0, 0.15, 0]}
        fontSize={0.35}
        anchorX="center"
        anchorY="middle"
      >
        {square.emoji}
      </Text>
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

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.position.x += (targetPos[0] - meshRef.current.position.x) * 0.08;
      meshRef.current.position.z += (targetPos[2] - meshRef.current.position.z) * 0.08;
      meshRef.current.position.y = 0.6 + Math.sin(Date.now() * 0.003) * 0.1;
    }
  });

  return (
    <group ref={meshRef} position={[targetPos[0], 0.6, targetPos[2]]}>
      <mesh>
        <sphereGeometry args={[0.35, 16, 16]} />
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
  const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.15, 8, true);

  return (
    <mesh geometry={tubeGeo}>
      <meshStandardMaterial color="#D7CCC8" />
    </mesh>
  );
}

function BoardScene({ board, playerPosition, animalEmoji, highlightedSquare }: {
  board: BoardSquare[];
  playerPosition: number;
  animalEmoji: string;
  highlightedSquare: number | null;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <circleGeometry args={[9, 32]} />
        <meshStandardMaterial color="#4CAF50" />
      </mesh>

      {/* Path */}
      <BoardPath total={board.length} />

      {/* Squares */}
      {board.map((sq, i) => (
        <BoardSquare3D
          key={sq.id}
          square={sq}
          index={i}
          total={board.length}
          isPlayerHere={i === playerPosition}
          isHighlighted={i === highlightedSquare}
        />
      ))}

      {/* Player */}
      <PlayerToken position={playerPosition} total={board.length} animalEmoji={animalEmoji} />

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

// --- Dice UI ---

const DiceIcon = ({ value }: { value: number }) => {
  const icons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
  const Icon = icons[value - 1] || Dice1;
  return <Icon className="w-16 h-16" />;
};

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
  const [rollingDisplay, setRollingDisplay] = useState(1);
  const rollingInterval = useRef<NodeJS.Timeout | null>(null);

  const handleRoll = useCallback(() => {
    if (state.rollsRemaining <= 0 || state.isRolling || state.isMoving) return;

    setState(s => ({ ...s, isRolling: true, rewardMessage: null }));

    // Animate dice rolling
    let ticks = 0;
    rollingInterval.current = setInterval(() => {
      setRollingDisplay(Math.floor(Math.random() * 6) + 1);
      ticks++;
      if (ticks >= 15) {
        if (rollingInterval.current) clearInterval(rollingInterval.current);

        const finalRoll = Math.floor(Math.random() * 6) + 1;
        setRollingDisplay(finalRoll);

        const newPosition = (state.playerPosition + finalRoll) % board.length;
        setHighlightedSquare(newPosition);

        setState(s => ({
          ...s,
          lastRoll: finalRoll,
          isRolling: false,
          isMoving: true,
          rollsRemaining: s.rollsRemaining - 1,
        }));

        // Move animation delay, then apply reward
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
        <Canvas camera={{ position: [0, 12, 8], fov: 45 }}>
          <BoardScene
            board={board}
            playerPosition={state.playerPosition}
            animalEmoji={animalEmoji}
            highlightedSquare={highlightedSquare}
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
            <div className={`transition-transform ${state.isRolling ? 'animate-bounce' : ''}`}>
              <DiceIcon value={state.lastRoll ?? rollingDisplay} />
            </div>
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

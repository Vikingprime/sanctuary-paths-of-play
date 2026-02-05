import { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera, Sky, useGLTF, useAnimations } from '@react-three/drei';
import { Maze, MazeCharacter } from '@/types/game';
import { Button } from '@/components/ui/button';
import * as THREE from 'three';
import { Suspense } from 'react';

interface IntroDialogue {
  characterId?: string;
  speaker: string;
  speakerEmoji: string;
  message: string;
  characterPosition?: { x: number; y: number };
  characterModel?: string;
}

interface MazeIntroSequenceProps {
  maze: Maze;
  introDialogues: IntroDialogue[];
  onComplete: () => void;
  isMuted?: boolean;
}

export const MazeIntroSequence = ({
  maze,
  introDialogues,
  onComplete,
  isMuted = false,
}: MazeIntroSequenceProps) => {
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [isShowingMazePreview, setIsShowingMazePreview] = useState(false);
  const [mazePreviewCountdown, setMazePreviewCountdown] = useState(3);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const currentDialogue = introDialogues[currentDialogueIndex];
  const isLastDialogue = currentDialogueIndex >= introDialogues.length - 1;

  // Get character position for camera focus
  const getCharacterPosition = useCallback((dialogue: IntroDialogue) => {
    if (dialogue.characterPosition) {
      return dialogue.characterPosition;
    }
    if (dialogue.characterId && maze.characters) {
      const character = maze.characters.find(c => c.id === dialogue.characterId);
      if (character) {
        return character.position;
      }
    }
    // Default to start position
    return { x: 5, y: 5 };
  }, [maze.characters]);

  // Handle continue button
  const handleContinue = useCallback(() => {
    if (isTransitioning) return;

    if (isLastDialogue) {
      // Show maze preview before starting
      setIsTransitioning(true);
      setTimeout(() => {
        setIsShowingMazePreview(true);
        setIsTransitioning(false);
      }, 300);
    } else {
      // Next dialogue with transition
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentDialogueIndex(prev => prev + 1);
        setIsTransitioning(false);
      }, 300);
    }
  }, [isLastDialogue, isTransitioning]);

  // Ref to store onComplete callback - avoids timer restart when callback reference changes
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Maze preview countdown - using ref pattern for stable timing
  useEffect(() => {
    if (!isShowingMazePreview) return;

    // Use timestamp-based approach for reliable timing
    const startTime = Date.now();
    const duration = maze.previewTime;
    
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      
      setMazePreviewCountdown(remaining);
      
      if (remaining <= 0) {
        clearInterval(timer);
        onCompleteRef.current(); // Call via ref to avoid dependency
      }
    }, 100); // Check every 100ms for smoother updates

    return () => clearInterval(timer);
  }, [isShowingMazePreview, maze.previewTime]); // onComplete removed from deps

  // Skip intro button
  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  if (isShowingMazePreview) {
    return <MazePreviewView maze={maze} countdown={mazePreviewCountdown} onSkip={handleSkip} />;
  }

  const characterPos = getCharacterPosition(currentDialogue);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* 3D Character View */}
      <div className="absolute inset-0">
        <Canvas shadows>
          <Suspense fallback={null}>
            <IntroScene
              characterPosition={characterPos}
              characterModel={currentDialogue.characterModel}
              characterId={currentDialogue.characterId}
              mazeCharacters={maze.characters}
              isTransitioning={isTransitioning}
            />
          </Suspense>
        </Canvas>
      </div>

      {/* Dialogue Overlay */}
      <div className={`absolute inset-0 flex items-end justify-center p-4 pointer-events-none transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        <div className="bg-card/95 backdrop-blur-sm rounded-2xl p-6 shadow-warm-lg max-w-lg w-full mb-8 pointer-events-auto animate-fade-in">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0">
              {currentDialogue.speakerEmoji}
            </div>
            <div className="flex-1">
              <h4 className="font-display font-bold text-foreground mb-2">
                {currentDialogue.speaker}
              </h4>
              <p className="text-foreground/90 text-lg leading-relaxed">
                {currentDialogue.message}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleContinue} className="flex-1 py-3">
              {isLastDialogue ? 'Start Maze' : 'Continue'}
            </Button>
            <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
              Skip
            </Button>
          </div>
          
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-4">
            {introDialogues.map((_, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === currentDialogueIndex
                    ? 'bg-primary'
                    : idx < currentDialogueIndex
                    ? 'bg-primary/50'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// 3D Scene for intro character view
interface IntroSceneProps {
  characterPosition: { x: number; y: number };
  characterModel?: string;
  characterId?: string;
  mazeCharacters?: MazeCharacter[];
  isTransitioning: boolean;
}

const IntroScene = ({
  characterPosition,
  characterModel,
  characterId,
  mazeCharacters,
  isTransitioning,
}: IntroSceneProps) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  // Find character data
  const character = characterId && mazeCharacters
    ? mazeCharacters.find(c => c.id === characterId)
    : null;

  const modelToUse = character?.model || characterModel || 'Farmer.glb';
  const posX = characterPosition.x;
  const posZ = characterPosition.y;

  // Camera position: slightly in front and above the character
  const cameraPos: [number, number, number] = [posX + 2, 2, posZ + 3];
  const lookAt: [number, number, number] = [posX, 1, posZ];

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={cameraPos}
        fov={50}
      />
      
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      {/* Sky */}
      <Sky sunPosition={[100, 20, 100]} />
      
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[posX, 0, posZ]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#7cb342" />
      </mesh>

      {/* Character */}
      <IntroCharacterModel
        modelPath={`/models/${modelToUse}`}
        position={[posX, 0, posZ]}
      />

      {/* Fog for atmosphere */}
      <fog attach="fog" args={['#c8e6c9', 10, 50]} />
    </>
  );
};

// Simple character model for intro sequence
interface IntroCharacterModelProps {
  modelPath: string;
  position: [number, number, number];
}

const IntroCharacterModel = ({ modelPath, position }: IntroCharacterModelProps) => {
  const { scene, animations } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    // Try to play idle animation
    const idleAction = actions['Idle'] || actions['idle'] || Object.values(actions)[0];
    if (idleAction) {
      idleAction.reset().fadeIn(0.3).play();
    }
    return () => {
      if (idleAction) idleAction.fadeOut(0.3);
    };
  }, [actions]);

  return (
    <group ref={groupRef} position={position} rotation={[0, Math.PI, 0]}>
      <primitive object={scene.clone()} castShadow />
    </group>
  );
};

// Maze preview before game starts
interface MazePreviewViewProps {
  maze: Maze;
  countdown: number;
  onSkip: () => void;
}

const MazePreviewView = ({ maze, countdown, onSkip }: MazePreviewViewProps) => {
  const gridHeight = maze.grid.length;
  const gridWidth = maze.grid[0]?.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4">
      {/* Countdown */}
      <div className="text-center mb-6 animate-fade-in">
        <p className="text-muted-foreground mb-2">Starting in...</p>
        <div className="text-6xl font-display font-bold text-primary animate-pulse">
          {countdown}
        </div>
      </div>

      {/* Mini map preview */}
      <div className="bg-card rounded-2xl p-4 shadow-warm-lg animate-scale-in">
        <h3 className="font-display font-bold text-foreground text-center mb-4">
          {maze.name}
        </h3>
        <div
          className="grid gap-0.5 mx-auto"
          style={{
            gridTemplateColumns: `repeat(${gridWidth}, minmax(0, 1fr))`,
            width: Math.min(gridWidth * 12, 300),
          }}
        >
          {maze.grid.map((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                className={`aspect-square rounded-sm ${
                  cell.isWall
                    ? 'bg-amber-700'
                    : cell.isStart
                    ? 'bg-green-500'
                    : cell.isEnd
                    ? 'bg-red-500'
                    : cell.isStation
                    ? 'bg-blue-500'
                    : 'bg-amber-100'
                }`}
                style={{ width: Math.min(12, 300 / gridWidth) }}
              />
            ))
          )}
        </div>
      </div>

      {/* Skip button */}
      <Button
        variant="ghost"
        onClick={onSkip}
        className="mt-6 text-muted-foreground"
      >
        Skip Preview
      </Button>
    </div>
  );
};

export default MazeIntroSequence;

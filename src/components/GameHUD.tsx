import { useState } from 'react';
import { AnimalType } from '@/types/game';
import { animals } from '@/data/animals';
import { cn } from '@/lib/utils';
import { PerformanceInfo } from './Maze3DScene';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface GameHUDProps {
  animalType: AnimalType;
  timeLeft: number;
  mazeName: string;
  abilityUsed: boolean;
  onUseAbility: () => void;
  onQuit: () => void;
  onRestart: () => void;
  debugMode?: boolean;
  // Sound control
  isMuted?: boolean;
  onToggleMute?: () => void;
  // Corn optimization toggles
  shadowOptEnabled?: boolean;
  distanceCullEnabled?: boolean;
  onToggleShadowOpt?: () => void;
  onToggleDistanceCull?: () => void;
  // Dynamic fog toggle
  dynamicFogEnabled?: boolean;
  onToggleDynamicFog?: () => void;
  // Edge corn culling toggle
  edgeCornCullEnabled?: boolean;
  onToggleEdgeCornCull?: () => void;
  // Performance debug
  lowPixelRatio?: boolean;
  onTogglePixelRatio?: () => void;
  performanceInfo?: PerformanceInfo;
  // Camera and collision debug toggles
  topDownCamera?: boolean;
  onToggleTopDownCamera?: () => void;
  groundLevelCamera?: boolean;
  onToggleGroundLevelCamera?: () => void;
  showCollisionDebug?: boolean;
  onToggleCollisionDebug?: () => void;
}

export const GameHUD = ({
  animalType,
  timeLeft,
  mazeName,
  abilityUsed,
  onUseAbility,
  onQuit,
  onRestart,
  debugMode = false,
  isMuted = false,
  onToggleMute,
  shadowOptEnabled = true,
  distanceCullEnabled = true,
  onToggleShadowOpt,
  onToggleDistanceCull,
  dynamicFogEnabled = true,
  onToggleDynamicFog,
  edgeCornCullEnabled = true,
  onToggleEdgeCornCull,
  lowPixelRatio = false,
  onTogglePixelRatio,
  performanceInfo,
  topDownCamera = false,
  onToggleTopDownCamera,
  groundLevelCamera = false,
  onToggleGroundLevelCamera,
  showCollisionDebug = true,
  onToggleCollisionDebug,
}: GameHUDProps) => {
  const animal = animals.find((a) => a.id === animalType)!;
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showQuitDialog, setShowQuitDialog] = useState(false);

  return (
    <>
    <div className="absolute inset-x-0 top-0 z-40 p-4">
      <div className="flex items-start justify-between max-w-4xl mx-auto">
        {/* Left: Animal & Level Info */}
        <div className="bg-card/90 backdrop-blur-sm rounded-xl p-3 shadow-lg flex items-center gap-3">
          <span className="text-3xl">{animal.emoji}</span>
          <div>
            <div className="font-display font-bold text-foreground text-sm">
              {mazeName}
            </div>
            <div className="text-xs text-muted-foreground">
              {animal.name}
            </div>
          </div>
        </div>

        {/* Center: Timer */}
        <div
          className={cn(
            'bg-card/90 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg',
            timeLeft <= 10 && 'bg-destructive/90 animate-pulse'
          )}
        >
          <span
            className={cn(
              'font-display font-bold text-2xl',
              timeLeft <= 10 ? 'text-destructive-foreground' : 'text-foreground'
            )}
          >
            ⏱️ {Math.ceil(timeLeft)}s
          </span>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={onUseAbility}
            disabled={abilityUsed}
            className={cn(
              'bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg',
              'font-display font-semibold text-sm transition-all',
              abilityUsed
                ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                : 'hover:bg-primary hover:text-primary-foreground'
            )}
          >
            {animal.ability.icon} {abilityUsed ? 'Used' : animal.ability.name}
          </button>
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg font-display text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
          )}
          <button
            onClick={() => setShowRestartDialog(true)}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg font-display text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Restart</span>
          </button>
          <button
            onClick={() => setShowQuitDialog(true)}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg font-display text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ Quit
          </button>
          
          {/* Corn optimization toggles - only in debug mode */}
          {debugMode && (
            <div className="flex flex-col gap-2">
              {onToggleShadowOpt && (
                <button
                  onClick={onToggleShadowOpt}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    shadowOptEnabled ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Shadow optimization (boundary corn has no shadows)"
                >
                  🌑 {shadowOptEnabled ? 'On' : 'Off'}
                </button>
              )}
              {onToggleDistanceCull && (
                <button
                  onClick={onToggleDistanceCull}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    distanceCullEnabled ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Distance culling"
                >
                  📏 {distanceCullEnabled ? 'On' : 'Off'}
                </button>
              )}
              {onToggleDynamicFog && (
                <button
                  onClick={onToggleDynamicFog}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    dynamicFogEnabled ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Dynamic fog (hides outer corn when far)"
                >
                  🌫️ {dynamicFogEnabled ? 'On' : 'Off'}
                </button>
              )}
              {onToggleEdgeCornCull && (
                <button
                  onClick={onToggleEdgeCornCull}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    edgeCornCullEnabled ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Edge corn culling (hides distant edge corn)"
                >
                  🌽 {edgeCornCullEnabled ? 'On' : 'Off'}
                </button>
              )}
              {onTogglePixelRatio && (
                <button
                  onClick={onTogglePixelRatio}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    lowPixelRatio ? 'text-yellow-500' : 'text-green-500'
                  )}
                  title="Pixel ratio (low = better performance)"
                >
                  🖼️ {lowPixelRatio ? '0.5x' : '1x'}
                </button>
              )}
              {onToggleTopDownCamera && (
                <button
                  onClick={onToggleTopDownCamera}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    topDownCamera ? 'text-cyan-500' : 'text-green-500'
                  )}
                  title="Toggle camera view"
                >
                  📷 {topDownCamera ? 'Top' : 'Normal'}
                </button>
              )}
              {onToggleGroundLevelCamera && (
                <button
                  onClick={onToggleGroundLevelCamera}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    groundLevelCamera ? 'text-orange-500' : 'text-green-500'
                  )}
                  title="Ground level camera (debug height)"
                >
                  👁️ {groundLevelCamera ? 'Ground' : 'Normal'}
                </button>
              )}
              {onToggleCollisionDebug && (
                <button
                  onClick={onToggleCollisionDebug}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    showCollisionDebug ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Show collision debug spheres"
                >
                  🔴 {showCollisionDebug ? 'On' : 'Off'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full Performance Profiler Panel - only in debug mode */}
      {debugMode && performanceInfo && (
        <div className="block absolute top-20 left-4 bg-black/80 rounded-lg px-3 py-2 text-xs font-mono text-white max-w-[200px]">
          <div className="text-yellow-400 font-bold mb-1 border-b border-yellow-400/30 pb-1">PERF PROFILER</div>
          
          {/* Frame timing */}
          {performanceInfo.frameTime !== undefined && (
            <div className={cn(
              performanceInfo.frameTime > 33 ? 'text-red-400' : 
              performanceInfo.frameTime > 20 ? 'text-yellow-400' : 'text-green-400'
            )}>
              Frame: {performanceInfo.frameTime.toFixed(1)}ms ({(1000 / performanceInfo.frameTime).toFixed(0)} fps)
            </div>
          )}
          
          {/* GPU/CPU indicators */}
          <div className="mt-1 text-gray-400 text-[10px]">--- GPU Load ---</div>
          
          {/* Draw calls */}
          <div className={cn(
            performanceInfo.drawCalls > 100 ? 'text-red-400' : 
            performanceInfo.drawCalls > 50 ? 'text-yellow-400' : 'text-green-400'
          )}>
            Draw calls: {performanceInfo.drawCalls}
          </div>
          
          {/* Triangles */}
          <div className={cn(
            performanceInfo.triangles > 500000 ? 'text-red-400' : 
            performanceInfo.triangles > 200000 ? 'text-yellow-400' : 'text-green-400'
          )}>
            Triangles: {(performanceInfo.triangles / 1000).toFixed(1)}k
          </div>
          
          {/* Textures & Geometries */}
          <div className={cn(
            performanceInfo.textures > 50 ? 'text-yellow-400' : 'text-white'
          )}>
            Textures: {performanceInfo.textures}
          </div>
          <div className={cn(
            performanceInfo.geometries > 100 ? 'text-yellow-400' : 'text-white'
          )}>
            Geometries: {performanceInfo.geometries}
          </div>
          <div>Shaders: {performanceInfo.programs}</div>
          
          {/* Bottleneck indicator */}
          <div className="mt-1 pt-1 border-t border-gray-600">
            <div className="text-[10px] text-gray-400">Bottleneck:</div>
            <div className={cn(
              'font-bold',
              (performanceInfo.drawCalls > 80 || performanceInfo.triangles > 400000) ? 'text-red-400' : 'text-cyan-400'
            )}>
              {performanceInfo.drawCalls > 80 ? '⚠️ CPU (draw calls)' :
               performanceInfo.triangles > 400000 ? '⚠️ GPU (geometry)' :
               performanceInfo.frameTime > 33 ? '🔍 Unknown - toggle features' :
               '✓ Balanced'}
            </div>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="bg-card/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg text-xs text-muted-foreground">
          <span className="hidden md:inline">Use Arrow Keys or WASD to move • Q/E to rotate</span>
          <span className="md:hidden">Use on-screen controls to move</span>
        </div>
      </div>
    </div>

    {/* Restart Confirmation Dialog */}
    <AlertDialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restart Level?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to restart? Your current progress will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onRestart}>Restart</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Quit Confirmation Dialog */}
    <AlertDialog open={showQuitDialog} onOpenChange={setShowQuitDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quit Level?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to quit? You won't receive a score for this attempt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onQuit}>Quit</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

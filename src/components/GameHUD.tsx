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
  // Performance debug
  performanceInfo?: PerformanceInfo;
  // Camera and collision debug toggles (kept)
  topDownCamera?: boolean;
  onToggleTopDownCamera?: () => void;
  groundLevelCamera?: boolean;
  onToggleGroundLevelCamera?: () => void;
  showCollisionDebug?: boolean;
  onToggleCollisionDebug?: () => void;
  // New debug toggles
  autopushEnabled?: boolean;
  onToggleAutopush?: () => void;
  verboseLogging?: boolean;
  onToggleVerboseLogging?: () => void;
  losFaderEnabled?: boolean;
  onToggleLOSFader?: () => void;
  // Feature toggles for performance testing
  shadowsEnabled?: boolean;
  onToggleShadows?: () => void;
  grassEnabled?: boolean;
  onToggleGrass?: () => void;
  rocksEnabled?: boolean;
  onToggleRocks?: () => void;
  animationsEnabled?: boolean;
  onToggleAnimations?: () => void;
  opacityFadeEnabled?: boolean;
  onToggleOpacityFade?: () => void;
  cornEnabled?: boolean;
  onToggleCorn?: () => void;
  // Camera mode toggle (mouse camera on desktop)
  cameraModeEnabled?: boolean;
  onToggleCameraMode?: () => void;
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
  performanceInfo,
  topDownCamera = false,
  onToggleTopDownCamera,
  groundLevelCamera = false,
  onToggleGroundLevelCamera,
  showCollisionDebug = true,
  onToggleCollisionDebug,
  autopushEnabled = true,
  onToggleAutopush,
  verboseLogging = false,
  onToggleVerboseLogging,
  losFaderEnabled = true,
  onToggleLOSFader,
  // New feature toggles
  shadowsEnabled = true,
  onToggleShadows,
  grassEnabled = true,
  onToggleGrass,
  rocksEnabled = true,
  onToggleRocks,
  animationsEnabled = true,
  onToggleAnimations,
  opacityFadeEnabled = true,
  onToggleOpacityFade,
  cornEnabled = true,
  onToggleCorn,
  cameraModeEnabled = false,
  onToggleCameraMode,
}: GameHUDProps) => {
  const animal = animals.find((a) => a.id === animalType)!;
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showQuitDialog, setShowQuitDialog] = useState(false);

  return (
    <>
    <div className="absolute inset-x-0 top-0 z-40 p-2 sm:p-4 pointer-events-none">
      <div className="flex items-start justify-between max-w-4xl mx-auto">
        {/* Left: Animal & Level Info */}
        <div className="bg-card/90 backdrop-blur-sm rounded-xl p-2 sm:p-3 shadow-lg flex items-center gap-2 sm:gap-3 pointer-events-auto">
          <span className="text-2xl sm:text-3xl">{animal.emoji}</span>
          <div>
            <div className="font-display font-bold text-foreground text-xs sm:text-sm">
              {mazeName}
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              {animal.name}
            </div>
          </div>
        </div>

        {/* Center: Timer */}
        <div
          className={cn(
            'bg-card/90 backdrop-blur-sm rounded-full px-4 py-2 sm:px-6 sm:py-3 shadow-lg',
            timeLeft <= 10 && 'bg-destructive/90 animate-pulse'
          )}
        >
          <span
            className={cn(
              'font-display font-bold text-lg sm:text-2xl',
              timeLeft <= 10 ? 'text-destructive-foreground' : 'text-foreground'
            )}
          >
            ⏱️ {Math.ceil(timeLeft)}s
          </span>
        </div>

        {/* Right: Controls */}
        <div className="flex flex-col gap-1 sm:gap-2 pointer-events-auto">
          <button
            onClick={onUseAbility}
            disabled={abilityUsed}
            className={cn(
              'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg',
              'font-display font-semibold text-xs sm:text-sm transition-all',
              abilityUsed
                ? 'opacity-50 cursor-not-allowed text-muted-foreground'
                : 'hover:bg-primary hover:text-primary-foreground'
            )}
          >
            {animal.ability.icon} <span className="hidden landscape:hidden sm:inline">{abilityUsed ? 'Used' : animal.ability.name}</span>
          </button>
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg font-display text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 sm:gap-2"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-3 h-3 sm:w-4 sm:h-4" /> : <Volume2 className="w-3 h-3 sm:w-4 sm:h-4" />}
              <span className="hidden landscape:hidden sm:inline">{isMuted ? 'Muted' : 'Sound'}</span>
            </button>
          )}
          <button
            onClick={() => setShowRestartDialog(true)}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg font-display text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 sm:gap-2"
          >
            <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden landscape:hidden sm:inline">Restart</span>
          </button>
          <button
            onClick={() => setShowQuitDialog(true)}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg font-display text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ <span className="hidden landscape:hidden sm:inline">Quit</span>
          </button>
          
          {/* Debug toggles - only in debug mode */}
          {debugMode && (
            <div className="flex flex-col gap-2">
              {/* Camera view toggles (kept) */}
              {onToggleTopDownCamera && (
                <button
                  onClick={onToggleTopDownCamera}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    topDownCamera ? 'text-cyan-500' : 'text-muted-foreground'
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
                    groundLevelCamera ? 'text-orange-500' : 'text-muted-foreground'
                  )}
                  title="Ground level camera (debug height)"
                >
                  👁️ {groundLevelCamera ? 'Ground' : 'Normal'}
                </button>
              )}
              {/* Collision capsule toggle (kept) */}
              {onToggleCollisionDebug && (
                <button
                  onClick={onToggleCollisionDebug}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    showCollisionDebug ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Show collision debug spheres"
                >
                  🔴 Capsule {showCollisionDebug ? 'On' : 'Off'}
                </button>
              )}
              {/* New toggles */}
              {onToggleAutopush && (
                <button
                  onClick={onToggleAutopush}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    autopushEnabled ? 'text-green-500' : 'text-red-500'
                  )}
                  title="Camera autopush raycasting"
                >
                  📡 Autopush {autopushEnabled ? 'On' : 'Off'}
                </button>
              )}
              {onToggleLOSFader && (
                <button
                  onClick={onToggleLOSFader}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    losFaderEnabled ? 'text-green-500' : 'text-red-500'
                  )}
                  title="LOS corn fading"
                >
                  🌽 LOSFader {losFaderEnabled ? 'On' : 'Off'}
                </button>
              )}
              {onToggleVerboseLogging && (
                <button
                  onClick={onToggleVerboseLogging}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    verboseLogging ? 'text-yellow-500' : 'text-muted-foreground'
                  )}
                  title="Verbose collision/autopush logging"
                >
                  📝 Verbose {verboseLogging ? 'On' : 'Off'}
                </button>
              )}
              {onToggleCameraMode && (
                <button
                  onClick={onToggleCameraMode}
                  className={cn(
                    'bg-card/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg font-display text-xs transition-colors',
                    cameraModeEnabled ? 'text-purple-500' : 'text-muted-foreground'
                  )}
                  title="Mouse camera mode (WASD moves, mouse rotates camera)"
                >
                  🖱️ CamMode {cameraModeEnabled ? 'On' : 'Off'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full Performance Profiler Panel - only in debug mode */}
      {debugMode && performanceInfo && (
        <div className="block absolute top-20 left-4 bg-black/80 rounded-lg px-3 py-2 text-xs font-mono text-white max-w-[280px] max-h-[60vh] overflow-y-auto pointer-events-auto">
          <div className="text-yellow-400 font-bold mb-1 border-b border-yellow-400/30 pb-1">PERF PROFILER</div>
          
          {/* Player Position */}
          {performanceInfo.playerX !== undefined && (
            <div className="text-cyan-300">
              Pos: ({performanceInfo.playerX?.toFixed(1)}, {performanceInfo.playerZ?.toFixed(1)})
            </div>
          )}
          
          {/* Frame timing */}
          {performanceInfo.frameTime !== undefined && (
            <div className={cn(
              performanceInfo.frameTime > 33 ? 'text-red-400' : 
              performanceInfo.frameTime > 20 ? 'text-yellow-400' : 'text-green-400'
            )}>
              Frame: {performanceInfo.frameTime.toFixed(1)}ms ({(1000 / performanceInfo.frameTime).toFixed(0)} fps)
            </div>
          )}
          
          {/* GC Spikes indicator */}
          <div className={cn(
            (performanceInfo.gcSpikes ?? 0) > 0 ? 'text-red-400' : 'text-gray-500'
          )}>
            GC Spikes: {performanceInfo.gcSpikes ?? 0}
          </div>
          
          {/* Per-frame metrics */}
          <div className="mt-1 text-gray-400 text-[10px]">--- Per Frame ---</div>
          <div className={cn(
            (performanceInfo.raycastCount ?? 0) > 10 ? 'text-yellow-400' : 'text-white'
          )}>
            Raycasts: {performanceInfo.raycastCount ?? 0}
          </div>
          <div className="text-white">
            Faded cells: {performanceInfo.activeFadedCells ?? 0}
          </div>
          <div className={cn(
            (performanceInfo.collisionChecks ?? 0) > 20 ? 'text-yellow-400' : 'text-white'
          )}>
            Collision checks: {performanceInfo.collisionChecks ?? 0}
          </div>
          <div className={cn(
            (performanceInfo.opacityUpdates ?? 0) > 50 ? 'text-yellow-400' : 'text-white'
          )}>
            Opacity updates: {performanceInfo.opacityUpdates ?? 0}
          </div>
          <div className="text-white">
            Shadow moves: {performanceInfo.shadowMoves ?? 0}
          </div>
          <div className="text-white">
            Anim mixers: {performanceInfo.animationUpdates ?? 0}
          </div>
          
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
          
          {/* Feature Toggles */}
          <div className="mt-2 pt-2 border-t border-gray-600">
            <div className="text-[10px] text-gray-400 mb-1">--- Feature Toggles ---</div>
            <div className="flex flex-wrap gap-1">
              {onToggleShadows && (
                <button
                  onClick={onToggleShadows}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    shadowsEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Shadows
                </button>
              )}
              {onToggleGrass && (
                <button
                  onClick={onToggleGrass}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    grassEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Grass
                </button>
              )}
              {onToggleRocks && (
                <button
                  onClick={onToggleRocks}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    rocksEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Rocks
                </button>
              )}
              {onToggleAnimations && (
                <button
                  onClick={onToggleAnimations}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    animationsEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Anims
                </button>
              )}
              {onToggleOpacityFade && (
                <button
                  onClick={onToggleOpacityFade}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    opacityFadeEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Opacity
                </button>
              )}
              {onToggleCorn && (
                <button
                  onClick={onToggleCorn}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    cornEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Corn
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 pointer-events-auto">
        <div className="bg-card/80 backdrop-blur-sm rounded-full px-3 py-1.5 sm:px-4 sm:py-2 shadow-lg text-[10px] sm:text-xs text-muted-foreground">
          <span className="hidden md:inline">Use Arrow Keys or WASD to move • Q/E to rotate</span>
          <span className="md:hidden">Drag anywhere to move</span>
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

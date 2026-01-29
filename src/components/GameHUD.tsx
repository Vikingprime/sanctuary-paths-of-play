import { useState, MutableRefObject } from 'react';
import { AnimalType } from '@/types/game';
import { animals } from '@/data/animals';
import { cn } from '@/lib/utils';
import { PerformanceInfo } from './Maze3DScene';
import { Volume2, VolumeX, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { SpurConfig } from '@/game/MedialAxis';
import { MagnetismConfig, DEFAULT_MAGNETISM_CONFIG, MagnetismTurnResult } from '@/game/CorridorMagnetism';
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

// Sensitivity tuning config - exported for use in MobileControls
export interface SensitivityConfig {
  smallMoveSensitivity: number; // 1.0 - 5.0, higher = more sensitive for small moves
  largeMoveSensitivity: number; // 1.0 - 3.0, higher = more sensitive for large moves
  maxDragPixels: number;        // 30 - 80, pixels before max drag reached
}

export const DEFAULT_SENSITIVITY: SensitivityConfig = {
  smallMoveSensitivity: 1.5,  // Reduced from 3.0 - less aggressive small moves
  largeMoveSensitivity: 1.0,  // Reduced from 1.5 - smoother large moves
  maxDragPixels: 60,          // Slightly wider range
};

// ============================================================================
// MAGNETISM COMPASS - HUD Debug Visualization
// ============================================================================

interface MagnetismCompassProps {
  magnetismDebugRef: MutableRefObject<MagnetismTurnResult['debug'] | null>;
  playerRotation: number;
}

/**
 * Renders a compass showing the animal's alignment with the corridor spine.
 * - Shows animal facing direction
 * - Shows spine tangent direction
 * - Shows angle difference and turn correction
 * - Highlights nearest spine point info
 */
function MagnetismCompass({ magnetismDebugRef, playerRotation }: MagnetismCompassProps) {
  const debug = magnetismDebugRef.current;
  
  if (!debug) {
    return (
      <div className="mt-3 p-2 bg-gray-800/60 rounded border border-gray-600">
        <div className="text-[10px] text-gray-500 text-center">No magnetism data</div>
      </div>
    );
  }
  
  // Convert angles to SVG coordinates (0 = up, clockwise positive)
  const size = 80;
  const center = size / 2;
  const radius = 30;
  
  // Animal facing direction (from player rotation)
  const animalAngle = playerRotation;
  const animalX = center + Math.sin(animalAngle) * radius;
  const animalY = center - Math.cos(animalAngle) * radius;
  
  // Spine tangent direction
  const spineAngle = Math.atan2(debug.tangentX, debug.tangentZ);
  // Choose spine direction closer to animal facing
  let adjustedSpineAngle = spineAngle;
  const angleDiff = ((spineAngle - animalAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(angleDiff) > Math.PI / 2) {
    adjustedSpineAngle = spineAngle + Math.PI;
  }
  const spineX = center + Math.sin(adjustedSpineAngle) * radius;
  const spineY = center - Math.cos(adjustedSpineAngle) * radius;
  
  // Applied turn correction - shows where the magnetism is trying to turn the animal
  const appliedCorrection = debug.appliedTurnCorrection ?? 0;
  const turnVectorAngle = animalAngle + appliedCorrection;
  const turnVectorRadius = radius * 0.7; // Slightly shorter than main vectors
  const turnVectorX = center + Math.sin(turnVectorAngle) * turnVectorRadius;
  const turnVectorY = center - Math.cos(turnVectorAngle) * turnVectorRadius;
  
  // Turn correction arc
  const correctionAngle = debug.rawAngleDiff;
  const isActive = debug.isActive;
  const isJunction = debug.isJunctionSuppressed;
  
  // Status color
  const statusColor = isJunction ? '#ff4444' : isActive ? '#44ff44' : '#888888';
  const statusText = isJunction ? 'JUNCTION' : isActive ? 'ACTIVE' : 'IDLE';
  
  return (
    <div className="mt-3 p-2 bg-gray-800/60 rounded border border-gray-600">
      <div className="text-[9px] text-gray-400 mb-1 font-bold">TURN VECTOR</div>
      
      {/* SVG Compass */}
      <div className="flex items-center gap-2">
        <svg width={size} height={size} className="bg-gray-900/50 rounded">
          {/* Compass ring */}
          <circle 
            cx={center} 
            cy={center} 
            r={radius + 5} 
            fill="none" 
            stroke="#333" 
            strokeWidth="1"
          />
          
          {/* Grid lines */}
          <line x1={center} y1={5} x2={center} y2={size-5} stroke="#222" strokeWidth="1" />
          <line x1={5} y1={center} x2={size-5} y2={center} stroke="#222" strokeWidth="1" />
          
          {/* Spine tangent direction (cyan) */}
          <line 
            x1={center} 
            y1={center} 
            x2={spineX} 
            y2={spineY} 
            stroke="#00ffff" 
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx={spineX} cy={spineY} r={3} fill="#00ffff" />
          
          {/* Animal facing direction (yellow) */}
          <line 
            x1={center} 
            y1={center} 
            x2={animalX} 
            y2={animalY} 
            stroke="#ffff00" 
            strokeWidth="2"
            strokeLinecap="round"
          />
          <polygon 
            points={`${animalX},${animalY-4} ${animalX-3},${animalY+2} ${animalX+3},${animalY+2}`}
            fill="#ffff00"
            transform={`rotate(${(animalAngle * 180 / Math.PI)}, ${animalX}, ${animalY})`}
          />
          
          {/* Applied Turn Vector (magenta) - shows what correction is being applied */}
          {Math.abs(appliedCorrection) > 0.001 && (
            <>
              <line 
                x1={center} 
                y1={center} 
                x2={turnVectorX} 
                y2={turnVectorY} 
                stroke="#ff00ff" 
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="4,2"
              />
              <circle cx={turnVectorX} cy={turnVectorY} r={4} fill="#ff00ff" />
            </>
          )}
          
          {/* Center dot */}
          <circle cx={center} cy={center} r={3} fill={statusColor} />
        </svg>
        
        {/* Stats */}
        <div className="flex-1 text-[9px] space-y-0.5">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor }} />
            <span style={{ color: statusColor }}>{statusText}</span>
          </div>
          <div className="text-gray-400">
            Angle: <span className="text-white">{(correctionAngle * 180 / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="text-gray-400">
            Dist: <span className="text-white">{debug.crossDist.toFixed(2)}</span>
          </div>
          <div className="text-gray-400">
            Degree: <span className={cn(
              debug.nearestDegree >= 3 ? 'text-red-400' : 
              debug.nearestDegree === 2 ? 'text-cyan-400' : 'text-yellow-400'
            )}>{debug.nearestDegree}</span>
          </div>
          <div className="text-gray-400">
            Turn: <span className="text-fuchsia-400">{(appliedCorrection * 180 / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="text-[8px] mt-1">
            <span className="text-yellow-400">━</span> Animal
            {' '}
            <span className="text-cyan-400">━</span> Spine
          </div>
        </div>
      </div>
    </div>
  );
}

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
  simpleGroundEnabled?: boolean;
  onToggleSimpleGround?: () => void;
  cornCullingEnabled?: boolean;
  onToggleCornCulling?: () => void;
  skyEnabled?: boolean;
  onToggleSky?: () => void;
  shaderFadeEnabled?: boolean;
  onToggleShaderFade?: () => void;
  // Shadow resolution toggle
  lowShadowRes?: boolean;
  onToggleLowShadowRes?: () => void;
  // Sensitivity tuning
  sensitivityConfig?: SensitivityConfig;
  onSensitivityChange?: (config: SensitivityConfig) => void;
  // Mobile controls toggle (WASD only mode)
  mobileControlsEnabled?: boolean;
  onToggleMobileControls?: () => void;
  // Medial axis skeleton debug
  skeletonEnabled?: boolean;
  onToggleSkeleton?: () => void;
  // Overlay grid debug (walkable vs blocked subcells)
  overlayGridEnabled?: boolean;
  onToggleOverlayGrid?: () => void;
  // Spur tuning (debug visualization)
  spurConfig?: SpurConfig;
  defaultSpurConfig?: SpurConfig;
  onSpurConfigChange?: (config: SpurConfig) => void;
  showPrunedSpurs?: boolean;
  onToggleShowPrunedSpurs?: () => void;
  // Magnetism tuning
  magnetismConfig?: MagnetismConfig;
  onMagnetismConfigChange?: (config: MagnetismConfig) => void;
  // Magnetism debug visualization
  showMagnetTarget?: boolean;
  onToggleShowMagnetTarget?: () => void;
  showMagnetVector?: boolean;
  onToggleShowMagnetVector?: () => void;
  // Magnetism debug data for HUD visualization
  magnetismDebugRef?: MutableRefObject<MagnetismTurnResult['debug'] | null>;
  magnetismDebugFrozen?: boolean;
  playerRotation?: number;
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
  simpleGroundEnabled = false,
  onToggleSimpleGround,
  cornCullingEnabled = true,
  onToggleCornCulling,
  skyEnabled = true,
  onToggleSky,
  shaderFadeEnabled = true,
  onToggleShaderFade,
  lowShadowRes = false,
  onToggleLowShadowRes,
  sensitivityConfig = DEFAULT_SENSITIVITY,
  onSensitivityChange,
  mobileControlsEnabled = true,
  onToggleMobileControls,
  skeletonEnabled = false,
  onToggleSkeleton,
  overlayGridEnabled = false,
  onToggleOverlayGrid,
  spurConfig,
  defaultSpurConfig,
  onSpurConfigChange,
  showPrunedSpurs = false,
  onToggleShowPrunedSpurs,
  magnetismConfig,
  onMagnetismConfigChange,
  showMagnetTarget = false,
  onToggleShowMagnetTarget,
  showMagnetVector = false,
  onToggleShowMagnetVector,
  magnetismDebugRef,
  magnetismDebugFrozen = false,
  playerRotation = 0,
}: GameHUDProps) => {
  const animal = animals.find((a) => a.id === animalType)!;
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

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
            </div>
          )}
        </div>
      </div>

      {/* Full Performance Profiler Panel - only in debug mode */}
      {debugMode && performanceInfo && (
        <div className={cn(
          "block absolute top-20 left-4 bg-black/80 rounded-lg text-xs font-mono text-white pointer-events-auto transition-all",
          leftPanelCollapsed ? "px-1 py-1" : "px-3 py-2 max-w-[280px] max-h-[60vh] overflow-y-auto"
        )}>
          {/* Collapse toggle */}
          <button 
            onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
            className="absolute -right-2 top-1/2 -translate-y-1/2 bg-black/80 rounded-r p-0.5 hover:bg-black"
          >
            {leftPanelCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
          
          {leftPanelCollapsed ? (
            <div className="text-yellow-400 font-bold text-[10px] writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>PERF</div>
          ) : (
          <>
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
          <div className={cn(
            (performanceInfo.shadowCasters ?? 0) > 500 ? 'text-red-400' : 
            (performanceInfo.shadowCasters ?? 0) > 200 ? 'text-yellow-400' : 'text-green-400'
          )}>
            Shadow casters: {performanceInfo.shadowCasters ?? 0}
          </div>
          
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
              {onToggleAutopush && (
                <button
                  onClick={onToggleAutopush}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    autopushEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Push
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
              {onToggleShaderFade && (
                <button
                  onClick={onToggleShaderFade}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    shaderFadeEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Shader
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
              {onToggleSimpleGround && (
                <button
                  onClick={onToggleSimpleGround}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    simpleGroundEnabled ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'
                  )}
                >
                  Ground
                </button>
              )}
              {onToggleCornCulling && (
                <button
                  onClick={onToggleCornCulling}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    cornCullingEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Cull
                </button>
              )}
              {onToggleSky && (
                <button
                  onClick={onToggleSky}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    skyEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                >
                  Sky
                </button>
              )}
              {onToggleLowShadowRes && (
                <button
                  onClick={onToggleLowShadowRes}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    lowShadowRes ? 'bg-yellow-600 text-white' : 'bg-green-600 text-white'
                  )}
                  title="Toggle shadow resolution (2048 vs 512)"
                >
                  {lowShadowRes ? 'ShadLo' : 'ShadHi'}
                </button>
              )}
              {onToggleMobileControls && (
                <button
                  onClick={onToggleMobileControls}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    mobileControlsEnabled ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  )}
                  title="Disable mobile controls to use WASD only"
                >
                  Mobile
                </button>
              )}
              {onToggleSkeleton && (
                <button
                  onClick={onToggleSkeleton}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    skeletonEnabled ? 'bg-cyan-600 text-white' : 'bg-gray-600 text-white'
                  )}
                  title="Show medial axis skeleton (centerline)"
                >
                  Skeleton
                </button>
              )}
              {onToggleOverlayGrid && (
                <button
                  onClick={onToggleOverlayGrid}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    overlayGridEnabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'
                  )}
                  title="Show overlay grid (green=walkable, red=blocked)"
                >
                  OverlayGrid
                </button>
              )}
              {onToggleShowPrunedSpurs && (
                <button
                  onClick={onToggleShowPrunedSpurs}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold',
                    showPrunedSpurs ? 'bg-orange-600 text-white' : 'bg-gray-600 text-white'
                  )}
                  title="Show pruned spurs in orange"
                >
                  Spurs
                </button>
              )}
            </div>
          </div>
          
          {/* Spur Tuning Sliders */}
          {skeletonEnabled && onSpurConfigChange && spurConfig && defaultSpurConfig && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <div className="text-[10px] text-gray-400 mb-1">--- Spur Tuning ---</div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Max Spur Len:</span>
                    <span className={cn(
                      spurConfig.maxSpurLen !== defaultSpurConfig.maxSpurLen 
                        ? 'text-orange-400' 
                        : 'text-cyan-400'
                    )}>
                      {spurConfig.maxSpurLen}
                      {spurConfig.maxSpurLen !== defaultSpurConfig.maxSpurLen && (
                        <span className="text-gray-500 ml-1">(def: {defaultSpurConfig.maxSpurLen})</span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={spurConfig.maxSpurLen}
                    onChange={(e) => onSpurConfigChange({
                      ...spurConfig,
                      maxSpurLen: parseInt(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Min Spur Dist:</span>
                    <span className={cn(
                      spurConfig.minSpurDistance !== defaultSpurConfig.minSpurDistance 
                        ? 'text-orange-400' 
                        : 'text-cyan-400'
                    )}>
                      {spurConfig.minSpurDistance}
                      {spurConfig.minSpurDistance !== defaultSpurConfig.minSpurDistance && (
                        <span className="text-gray-500 ml-1">(def: {defaultSpurConfig.minSpurDistance})</span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={spurConfig.minSpurDistance}
                    onChange={(e) => onSpurConfigChange({
                      ...spurConfig,
                      minSpurDistance: parseInt(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                {/* Max Branch Len slider */}
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Max Branch Len:</span>
                    <span className={cn(
                      spurConfig.maxBranchLen !== defaultSpurConfig.maxBranchLen 
                        ? 'text-orange-400' 
                        : 'text-cyan-400'
                    )}>
                      {spurConfig.maxBranchLen}
                      {spurConfig.maxBranchLen !== defaultSpurConfig.maxBranchLen && (
                        <span className="text-gray-500 ml-1">(def: {defaultSpurConfig.maxBranchLen})</span>
                      )}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={spurConfig.maxBranchLen}
                    onChange={(e) => onSpurConfigChange({
                      ...spurConfig,
                      maxBranchLen: parseInt(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                {/* Raw Skeleton Toggle */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-700">
                  <span className="text-[10px]">Raw Skeleton (no cleanup)</span>
                  <button
                    onClick={() => onSpurConfigChange({
                      ...spurConfig,
                      skipCleanup: !spurConfig.skipCleanup
                    })}
                    className={cn(
                      "px-2 py-0.5 text-[9px] rounded",
                      spurConfig.skipCleanup
                        ? "bg-red-600 text-white"
                        : "bg-gray-700 text-gray-400"
                    )}
                  >
                    {spurConfig.skipCleanup ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="text-[9px] text-gray-500 mt-1">
                  Endpoint spurs ≤ maxLen; junction branches ≤ maxBranchLen (orange)
                </div>
              </div>
            </div>
          )}
          
          {/* Magnetism Tuning */}
          {magnetismConfig && onMagnetismConfigChange && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <div className="text-[10px] text-gray-400 mb-1">--- Corridor Magnetism ---</div>
              <div className="space-y-2">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px]">Enabled</span>
                  <button
                    onClick={() => onMagnetismConfigChange({
                      ...magnetismConfig,
                      enabled: !magnetismConfig.enabled
                    })}
                    className={cn(
                      "px-2 py-0.5 text-[9px] rounded font-bold",
                      magnetismConfig.enabled
                        ? "bg-green-600 text-white"
                        : "bg-red-600 text-white"
                    )}
                  >
                    {magnetismConfig.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                
                {/* Strength Slider */}
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Strength:</span>
                    <span className={cn(
                      magnetismConfig.strength !== DEFAULT_MAGNETISM_CONFIG.strength 
                        ? 'text-orange-400' 
                        : 'text-cyan-400'
                    )}>
                      {magnetismConfig.strength.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={magnetismConfig.strength}
                    onChange={(e) => onMagnetismConfigChange({
                      ...magnetismConfig,
                      strength: parseFloat(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                
                {/* Smoothing Tau Slider */}
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Smoothing:</span>
                    <span className="text-cyan-400">{(magnetismConfig.smoothingTau * 1000).toFixed(0)}ms</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="0.5"
                    step="0.05"
                    value={magnetismConfig.smoothingTau}
                    onChange={(e) => onMagnetismConfigChange({
                      ...magnetismConfig,
                      smoothingTau: parseFloat(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                
                {/* Debug Visualization Toggles */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
                  {onToggleShowMagnetTarget && (
                    <button
                      onClick={onToggleShowMagnetTarget}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-bold',
                        showMagnetTarget ? 'bg-green-600 text-white' : 'bg-gray-600 text-white'
                      )}
                      title="Show target point on skeleton"
                    >
                      Target
                    </button>
                  )}
                  {onToggleShowMagnetVector && (
                    <button
                      onClick={onToggleShowMagnetVector}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-bold',
                        showMagnetVector ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-white'
                      )}
                      title="Show vector from player to target"
                    >
                      Vector
                    </button>
                  )}
                </div>
                <div className="text-[9px] text-gray-500 mt-1">
                  Gently pulls animal toward corridor centerlines
                </div>
                
                {/* Turn Compass Visualization */}
                {magnetismDebugRef && (
                  <div className="relative">
                    <MagnetismCompass 
                      magnetismDebugRef={magnetismDebugRef}
                      playerRotation={playerRotation}
                    />
                    {magnetismDebugFrozen && (
                      <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-bold rounded animate-pulse">
                        ⏸ FROZEN (Space)
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Sensitivity Tuning */}
          {onSensitivityChange && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <div className="text-[10px] text-gray-400 mb-1">--- Turn Sensitivity ---</div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Small move sens:</span>
                    <span className="text-cyan-400">{sensitivityConfig.smallMoveSensitivity.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.1"
                    value={sensitivityConfig.smallMoveSensitivity}
                    onChange={(e) => onSensitivityChange({
                      ...sensitivityConfig,
                      smallMoveSensitivity: parseFloat(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Large move sens:</span>
                    <span className="text-cyan-400">{sensitivityConfig.largeMoveSensitivity.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                    value={sensitivityConfig.largeMoveSensitivity}
                    onChange={(e) => onSensitivityChange({
                      ...sensitivityConfig,
                      largeMoveSensitivity: parseFloat(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px]">
                    <span>Max drag (px):</span>
                    <span className="text-cyan-400">{sensitivityConfig.maxDragPixels}</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="80"
                    step="5"
                    value={sensitivityConfig.maxDragPixels}
                    onChange={(e) => onSensitivityChange({
                      ...sensitivityConfig,
                      maxDragPixels: parseInt(e.target.value)
                    })}
                    className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}
      
      {/* Right Debug Panel (controls) - collapsible */}
      {debugMode && (
        <div className={cn(
          "block absolute top-20 right-4 bg-black/80 rounded-lg text-xs font-mono text-white pointer-events-auto transition-all",
          rightPanelCollapsed ? "px-1 py-1" : "px-3 py-2"
        )}>
          {/* Collapse toggle */}
          <button 
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            className="absolute -left-2 top-1/2 -translate-y-1/2 bg-black/80 rounded-l p-0.5 hover:bg-black"
          >
            {rightPanelCollapsed ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          
          {rightPanelCollapsed ? (
            <div className="text-yellow-400 font-bold text-[10px]" style={{ writingMode: 'vertical-rl' }}>DBG</div>
          ) : (
            <div className="text-yellow-400 font-bold mb-1 border-b border-yellow-400/30 pb-1">DEBUG CONTROLS</div>
          )}
        </div>
      )}

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

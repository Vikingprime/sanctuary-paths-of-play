import { AnimalType } from '@/types/game';
import { animals } from '@/data/animals';
import { cn } from '@/lib/utils';
import { PerformanceInfo } from './Maze3DScene';

interface GameHUDProps {
  animalType: AnimalType;
  timeLeft: number;
  mazeName: string;
  abilityUsed: boolean;
  onUseAbility: () => void;
  onQuit: () => void;
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
  // Legacy (for backwards compat)
  drawCalls?: number;
  triangles?: number;
}

export const GameHUD = ({
  animalType,
  timeLeft,
  mazeName,
  abilityUsed,
  onUseAbility,
  onQuit,
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
  drawCalls,
  triangles,
}: GameHUDProps) => {
  const animal = animals.find((a) => a.id === animalType)!;

  return (
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
            ⏱️ {timeLeft}s
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
          <button
            onClick={onQuit}
            className="bg-card/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg font-display text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕ Quit
          </button>
          
          {/* Corn optimization toggles - hidden on mobile */}
          <div className="hidden md:flex flex-col gap-2">
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
          </div>
        </div>
      </div>

      {/* FPS Counter - shown on all devices */}
      {performanceInfo?.frameTime !== undefined && (
        <div className="absolute top-20 left-4 bg-black/80 rounded-lg px-3 py-2 text-xs font-mono">
          <div className={cn(
            'font-bold',
            performanceInfo.frameTime > 33 ? 'text-red-400' : 
            performanceInfo.frameTime > 20 ? 'text-yellow-400' : 'text-green-400'
          )}>
            {(1000 / performanceInfo.frameTime).toFixed(0)} FPS
          </div>
        </div>
      )}

      {/* Full Performance Profiler Panel - hidden on mobile */}
      {(performanceInfo || drawCalls !== undefined) && (
        <div className="hidden md:block absolute top-32 left-4 bg-black/80 rounded-lg px-3 py-2 text-xs font-mono text-white max-w-[200px]">
          <div className="text-yellow-400 font-bold mb-1 border-b border-yellow-400/30 pb-1">PERF PROFILER</div>
          
          {/* Frame timing */}
          {performanceInfo?.frameTime !== undefined && (
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
            (performanceInfo?.drawCalls ?? drawCalls ?? 0) > 100 ? 'text-red-400' : 
            (performanceInfo?.drawCalls ?? drawCalls ?? 0) > 50 ? 'text-yellow-400' : 'text-green-400'
          )}>
            Draw calls: {performanceInfo?.drawCalls ?? drawCalls ?? 0}
          </div>
          
          {/* Triangles */}
          <div className={cn(
            (performanceInfo?.triangles ?? triangles ?? 0) > 500000 ? 'text-red-400' : 
            (performanceInfo?.triangles ?? triangles ?? 0) > 200000 ? 'text-yellow-400' : 'text-green-400'
          )}>
            Triangles: {((performanceInfo?.triangles ?? triangles ?? 0) / 1000).toFixed(1)}k
          </div>
          
          {/* Textures & Geometries */}
          {performanceInfo && (
            <>
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
            </>
          )}
          
          {/* Bottleneck indicator */}
          {performanceInfo && (
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
          )}
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
  );
};

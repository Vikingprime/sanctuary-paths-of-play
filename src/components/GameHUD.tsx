import { AnimalType } from '@/types/game';
import { animals } from '@/data/animals';
import { cn } from '@/lib/utils';

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
          
          {/* Corn optimization toggles */}
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
        </div>
      </div>

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

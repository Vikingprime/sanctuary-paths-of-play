import { Animal } from '@/types/game';
import { getFriendshipTier, getNextFriendshipTier, AnimalFriendship } from '@/types/items';
import { cn } from '@/lib/utils';

interface FriendshipDisplayProps {
  animal: Animal;
  friendship: AnimalFriendship;
  className?: string;
  compact?: boolean;
}

// Displays an animal's friendship level with progress
export const FriendshipDisplay = ({
  animal,
  friendship,
  className,
  compact = false,
}: FriendshipDisplayProps) => {
  const currentTier = getFriendshipTier(friendship.friendPoints);
  const nextTier = getNextFriendshipTier(friendship.friendPoints);
  
  // Calculate progress percentage
  const progress = nextTier
    ? ((friendship.friendPoints - currentTier.pointsRequired) / 
       (nextTier.pointsRequired - currentTier.pointsRequired)) * 100
    : 100;
  
  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span className="text-lg">{animal.emoji}</span>
        <span className="text-sm font-medium">{currentTier.name}</span>
        <span className="text-xs text-muted-foreground">❤️ {friendship.friendPoints}</span>
      </div>
    );
  }
  
  return (
    <div className={cn('bg-card rounded-xl p-4 shadow-md', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl">{animal.emoji}</span>
        <div>
          <h3 className="font-display font-bold text-foreground">{animal.name}</h3>
          <p className="text-sm text-primary font-medium">{currentTier.name}</p>
        </div>
      </div>
      
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
        <span>❤️ {friendship.friendPoints} points</span>
        <span>🍎 {friendship.applesGiven} apples given</span>
      </div>
      
      {/* Progress bar */}
      {nextTier && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{currentTier.name}</span>
            <span>{nextTier.name}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-center text-muted-foreground">
            {nextTier.pointsRequired - friendship.friendPoints} more points to {nextTier.name}
          </p>
        </div>
      )}
      
      {/* Max tier reached */}
      {!nextTier && (
        <div className="text-center text-sm text-primary font-medium">
          ✨ Maximum friendship reached! ✨
        </div>
      )}
    </div>
  );
};

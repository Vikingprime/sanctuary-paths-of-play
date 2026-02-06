import { Quest, QuestObjective } from '@/types/quest';
import { CheckCircle2, Circle, MapPin } from 'lucide-react';

interface QuestLogOverlayProps {
  quest: Quest;
  completedObjectives: Set<string>;
  currentObjectiveId?: string;
  className?: string;
}

export const QuestLogOverlay = ({
  quest,
  completedObjectives,
  currentObjectiveId,
  className = '',
}: QuestLogOverlayProps) => {
  // Filter to only show non-hidden objectives or completed ones
  const visibleObjectives = quest.objectives.filter(
    obj => !obj.hidden || completedObjectives.has(obj.id)
  );

  // Find the first incomplete objective to highlight
  const activeObjective = visibleObjectives.find(
    obj => !completedObjectives.has(obj.id)
  );

  return (
    <div
      className={`absolute top-4 left-4 z-20 pointer-events-none ${className}`}
    >
      <div className="bg-card/90 backdrop-blur-sm rounded-xl shadow-lg max-w-xs overflow-hidden">
        {/* Quest title header */}
        <div className="bg-primary/20 px-3 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <h3 className="font-display font-bold text-sm text-foreground truncate">
              {quest.title}
            </h3>
          </div>
        </div>

        {/* Objectives list */}
        <div className="px-3 py-2 space-y-1.5">
          {visibleObjectives.map((objective) => {
            const isCompleted = completedObjectives.has(objective.id);
            const isActive = objective.id === activeObjective?.id;

            return (
              <div
                key={objective.id}
                className={`flex items-start gap-2 text-xs transition-all duration-300 ${
                  isCompleted
                    ? 'text-muted-foreground line-through opacity-60'
                    : isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-secondary flex-shrink-0 mt-0.5" />
                ) : (
                  <Circle
                    className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                      isActive ? 'text-primary animate-pulse' : 'text-muted-foreground'
                    }`}
                  />
                )}
                <span className={isActive ? 'font-medium' : ''}>
                  {objective.description}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

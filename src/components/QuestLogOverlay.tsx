import { Quest, QuestObjective, StoryProgress } from '@/types/quest';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, Circle, HelpCircle } from 'lucide-react';

interface QuestLogOverlayProps {
  quest: Quest;
  completedObjectives: Set<string>;
  className?: string;
}

export const QuestLogOverlay = ({
  quest,
  completedObjectives,
  className = '',
}: QuestLogOverlayProps) => {
  // Filter out hidden objectives that aren't completed yet
  const visibleObjectives = quest.objectives.filter(obj => 
    !obj.hidden || completedObjectives.has(obj.id)
  );

  return (
    <div className={`absolute top-32 left-4 z-20 pointer-events-auto ${className}`}>
      <div className="bg-card/90 backdrop-blur-sm rounded-xl shadow-lg border border-border/50 max-w-xs">
        {/* Quest Title */}
        <div className="px-4 py-3 border-b border-border/50">
          <h3 className="font-display font-bold text-foreground text-sm flex items-center gap-2">
            📜 {quest.title}
          </h3>
        </div>

        {/* Objectives */}
        <ScrollArea className="max-h-48">
          <div className="px-4 py-3 space-y-2">
            {visibleObjectives.map((objective) => {
              const isCompleted = completedObjectives.has(objective.id);
              
              return (
                <div
                  key={objective.id}
                  className={`flex items-start gap-2 text-xs ${
                    isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  )}
                  <span>{objective.description}</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Riddle Hint (for puzzle quests) */}
        {quest.riddleHint && (
          <div className="px-4 py-3 border-t border-border/50 bg-primary/5">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground italic whitespace-pre-line">
                {quest.riddleHint}
              </div>
            </div>
          </div>
        )}

        {/* Trail Hint (for future smell trail feature) */}
        {quest.trailHint && (
          <div className="px-4 py-3 border-t border-border/50 bg-secondary/5">
            <div className="flex items-start gap-2">
              <span className="text-sm">👃</span>
              <div className="text-xs text-muted-foreground italic">
                {quest.trailHint}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import { storyChapters, storyMazes, StoryMaze } from '@/data/storyMazes';
import { StoryProgress } from '@/types/quest';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, CheckCircle2, BookOpen } from 'lucide-react';

interface StoryLevelSelectProps {
  onSelect: (storyMaze: StoryMaze) => void;
  onBack: () => void;
  storyProgress: StoryProgress;
}

export const StoryLevelSelect = ({
  onSelect,
  onBack,
  storyProgress,
}: StoryLevelSelectProps) => {
  // Check if a chapter is unlocked
  const isChapterUnlocked = (chapterId: string): boolean => {
    const chapter = storyChapters.find(c => c.id === chapterId);
    if (!chapter) return false;
    
    // First chapter is always unlocked
    if (!chapter.unlockCondition) return true;
    
    // Check if required quest is completed
    return storyProgress.completedQuests.includes(chapter.unlockCondition.questId);
  };

  // Check if a quest is completed
  const isQuestCompleted = (questId: string): boolean => {
    return storyProgress.completedQuests.includes(questId);
  };

  // Get current quest for a chapter
  const getCurrentQuest = (chapterId: string) => {
    const chapter = storyChapters.find(c => c.id === chapterId);
    if (!chapter) return null;
    
    // Find the first incomplete quest
    for (const quest of chapter.quests) {
      if (!isQuestCompleted(quest.id)) {
        return quest;
      }
    }
    return null; // All completed
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
          Story Mode
        </h1>
        <div className="w-20" /> {/* Spacer for centering */}
      </div>

      {/* Chapters */}
      <div className="space-y-4">
        {storyChapters.map((chapter, index) => {
          const unlocked = isChapterUnlocked(chapter.id);
          const currentQuest = getCurrentQuest(chapter.id);
          const allCompleted = chapter.quests.every(q => isQuestCompleted(q.id));
          const storyMaze = storyMazes.find(m => m.id === chapter.mazeId);

          return (
            <div
              key={chapter.id}
              className={`bg-card rounded-2xl shadow-warm overflow-hidden transition-all ${
                !unlocked ? 'opacity-60' : ''
              }`}
            >
              {/* Chapter header */}
              <div className={`p-4 ${allCompleted ? 'bg-secondary/20' : 'bg-primary/10'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    allCompleted ? 'bg-secondary' : 'bg-primary/20'
                  }`}>
                    {allCompleted ? (
                      <CheckCircle2 className="w-5 h-5 text-secondary-foreground" />
                    ) : unlocked ? (
                      <BookOpen className="w-5 h-5 text-primary" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h2 className="font-display font-bold text-lg text-foreground">
                      {chapter.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {chapter.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quest list */}
              {unlocked && (
                <div className="p-4 space-y-3">
                  {chapter.quests.map((quest) => {
                    const completed = isQuestCompleted(quest.id);
                    const isCurrent = currentQuest?.id === quest.id;

                    return (
                      <button
                        key={quest.id}
                        onClick={() => storyMaze && onSelect(storyMaze)}
                        disabled={!isCurrent && !completed}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          completed
                            ? 'bg-secondary/10 border-secondary/30'
                            : isCurrent
                            ? 'bg-primary/5 border-primary hover:border-primary/80 hover:bg-primary/10'
                            : 'bg-muted/50 border-border opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {completed ? (
                            <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0" />
                          ) : (
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${
                              isCurrent ? 'border-primary' : 'border-muted-foreground'
                            }`} />
                          )}
                          <div className="flex-1 min-w-0">
                            <h3 className={`font-medium truncate ${
                              completed ? 'text-muted-foreground' : 'text-foreground'
                            }`}>
                              {quest.title}
                            </h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {quest.description}
                            </p>
                          </div>
                          {isCurrent && (
                            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                              PLAY
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Coming soon placeholder */}
      <div className="bg-muted/50 rounded-2xl p-6 text-center">
        <p className="text-muted-foreground text-sm">
          🌾 More chapters coming soon! 🌾
        </p>
      </div>
    </div>
  );
};

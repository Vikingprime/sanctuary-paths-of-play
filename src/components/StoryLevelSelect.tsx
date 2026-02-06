import { StoryProgress } from '@/types/quest';
import { StoryMaze, storyChapters, getChapterMaze } from '@/data/storyMazes';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, Check, BookOpen } from 'lucide-react';

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
  const isChapterUnlocked = (chapterId: string): boolean => {
    const chapter = storyChapters.find(c => c.id === chapterId);
    if (!chapter) return false;
    
    // First chapter is always unlocked
    if (!chapter.unlockCondition) return true;
    
    // Check if required quest is completed
    return storyProgress.completedQuests.includes(chapter.unlockCondition.questId);
  };

  const isChapterCompleted = (chapterId: string): boolean => {
    const chapter = storyChapters.find(c => c.id === chapterId);
    if (!chapter) return false;
    
    // Check if all quests in chapter are completed
    return chapter.quests.every(q => storyProgress.completedQuests.includes(q.id));
  };

  const handleChapterSelect = (chapterId: string) => {
    const maze = getChapterMaze(chapterId);
    if (maze) {
      onSelect(maze);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={onBack}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Button>

      {/* Title */}
      <div className="text-center space-y-2">
        <div className="text-4xl mb-2">📖</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
          Story Mode
        </h1>
        <p className="text-muted-foreground">
          Solve the mystery of the missing wedding ring!
        </p>
      </div>

      {/* Chapter Cards */}
      <div className="space-y-4 max-w-xl mx-auto">
        {storyChapters.map((chapter, index) => {
          const unlocked = isChapterUnlocked(chapter.id);
          const completed = isChapterCompleted(chapter.id);
          const maze = getChapterMaze(chapter.id);
          
          return (
            <button
              key={chapter.id}
              onClick={() => unlocked && handleChapterSelect(chapter.id)}
              disabled={!unlocked}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                unlocked
                  ? completed
                    ? 'bg-green-500/10 border-green-500/50 hover:border-green-500'
                    : 'bg-card border-primary/30 hover:border-primary hover:scale-[1.02]'
                  : 'bg-muted/50 border-border opacity-60 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Chapter Number / Status */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  completed
                    ? 'bg-green-500 text-white'
                    : unlocked
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {completed ? (
                    <Check className="w-6 h-6" />
                  ) : unlocked ? (
                    <BookOpen className="w-5 h-5" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                </div>

                {/* Chapter Info */}
                <div className="flex-1 min-w-0">
                  <h3 className={`font-display font-bold text-lg ${
                    unlocked ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {chapter.title}
                  </h3>
                  <p className={`text-sm mt-1 ${
                    unlocked ? 'text-muted-foreground' : 'text-muted-foreground/60'
                  }`}>
                    {chapter.description}
                  </p>
                  
                  {/* Quest info */}
                  {maze && unlocked && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        {maze.quest.title}
                      </span>
                      {completed && (
                        <span className="bg-green-500/20 text-green-600 px-2 py-0.5 rounded-full">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Lock reason */}
                  {!unlocked && chapter.unlockCondition && (
                    <p className="text-xs text-muted-foreground/60 mt-2 italic">
                      Complete previous chapter to unlock
                    </p>
                  )}
                </div>

                {/* Play indicator */}
                {unlocked && !completed && (
                  <div className="text-primary font-semibold text-sm flex-shrink-0">
                    Play →
                  </div>
                )}
                {completed && (
                  <div className="text-green-600 font-semibold text-sm flex-shrink-0">
                    Replay →
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Progress Summary */}
      <div className="text-center text-sm text-muted-foreground">
        <p>
          📖 {storyProgress.completedQuests.length} / {storyChapters.length} chapters completed
        </p>
      </div>
    </div>
  );
};

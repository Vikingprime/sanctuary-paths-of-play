import { useState, useEffect, useCallback } from 'react';
import { AnimalType, Maze, MedalType } from '@/types/game';
import { GameMode, StoryProgress } from '@/types/quest';
import { animals } from '@/data/animals';
import { useMazeStorage } from '@/hooks/useMazeStorage';
import { useAppleSystem } from '@/hooks/useAppleSystem';
import { AnimalCard } from '@/components/AnimalCard';
import { LevelSelect } from '@/components/LevelSelect';
import { MazeGame3D } from '@/components/MazeGame3D';
import { ProgressTracker } from '@/components/ProgressTracker';
import { Header } from '@/components/Header';
import { HowToPlayPanel } from '@/components/HowToPlayPanel';
import { ModeSelectScreen } from '@/components/ModeSelectScreen';
import { StoryLevelSelect } from '@/components/StoryLevelSelect';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSave } from '@/hooks/useSave';
import { useBackButton } from '@/hooks/useBackButton';
import { Volume2, VolumeX, ArrowLeft } from 'lucide-react';
import { storyMazes, storyMazeToMaze, StoryMaze, storyChapters } from '@/data/storyMazes';
import { BoardGameMode } from '@/components/BoardGameMode';

// Flow: home -> mode_select -> animal_select -> levels/story_levels -> playing
type GameScreen = 'mode_select' | 'animal_select' | 'levels' | 'story_levels' | 'playing' | 'board_game';

const Index = () => {
  const { save, loading, refresh, startAttempt, completeLevel, addScore, unlockMeal, updateSettings, isMazeUnlocked, unlockMazeWithCurrency } = useSave();
  const { getAllMazes, isLoaded: mazesLoaded } = useMazeStorage();
  const { 
    appleCount, 
    collectApple, 
    feedApple, 
    canFeedApple,
    getFriendship, 
    getApplesGivenCount,
    getProgress, 
    addTestApples,
    pendingAppleDialogue,
    completePendingDialogue,
  } = useAppleSystem();
  const [berryCount, setBerryCount] = useState(0);
  const [screen, setScreen] = useState<GameScreen>('mode_select');
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalType | null>(null);
  const [selectedMaze, setSelectedMaze] = useState<Maze | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  const [selectedStoryMaze, setSelectedStoryMaze] = useState<StoryMaze | null>(null);
  
  // Story progress (would be persisted in save system in full implementation)
  const [storyProgress, setStoryProgress] = useState<StoryProgress>({
    currentChapterId: 'chapter_1',
    currentQuestId: 'quest_ch1_missing_ring',
    completedQuests: [],
    completedChapters: [],
    activeObjectives: {},
  });
  const [mealProgress, setMealProgress] = useState(35);

  // Get mazes from storage
  const mazes = mazesLoaded ? getAllMazes() : [];

  // Sync selected animal from save
  useEffect(() => {
    if (save.player.currentAnimal) {
      setSelectedAnimal(save.player.currentAnimal as AnimalType);
    }
  }, [save.player.currentAnimal]);

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode);
    if (mode === 'story') {
      setScreen('story_levels');
    } else if (mode === 'board_game') {
      // Board game needs animal selection first
      setScreen('animal_select');
    } else {
      setScreen('animal_select');
    }
  };

  const handleAnimalSelect = (animalId: AnimalType) => {
    setSelectedAnimal(animalId);
  };

  const handleAnimalConfirm = () => {
    if (!selectedAnimal || !selectedMode) return;
    
    if (selectedMode === 'board_game') {
      setScreen('board_game');
      return;
    }
    
    if (selectedMode === 'story') {
      if (selectedMaze) {
        startAttempt(selectedMaze.id).then(() => setScreen('playing'));
      }
    } else {
      setScreen('levels');
    }
  };

  const handleLevelSelect = async (maze: Maze) => {
    setSelectedMaze(maze);
    setSelectedStoryMaze(null);
    await startAttempt(maze.id);
    setScreen('playing');
  };

  const handleStoryLevelSelect = async (storyMaze: StoryMaze) => {
    setSelectedStoryMaze(storyMaze);
    const maze = storyMazeToMaze(storyMaze);
    setSelectedMaze(maze);
    // In story mode, go to animal select after choosing a maze
    setScreen('animal_select');
  };

  const handleGameComplete = async (timeUsed: number) => {
    let result = { medal: null as MedalType, currencyEarned: 0, isBestTime: false, bestTime: null as number | null };
    
    if (selectedMaze) {
      const completionResult = await completeLevel(selectedMaze.id, timeUsed, selectedMaze);
      result = completionResult;
    }
    
    // For story mode, mark quest as complete
    if (selectedStoryMaze && selectedMode === 'story') {
      const questId = selectedStoryMaze.quest.id;
      if (!storyProgress.completedQuests.includes(questId)) {
        setStoryProgress(prev => ({
          ...prev,
          completedQuests: [...prev.completedQuests, questId],
        }));
      }
    }
    
    // Update meal progress
    const newProgress = mealProgress + result.currencyEarned;
    if (newProgress >= 100) {
      await unlockMeal();
      setMealProgress(newProgress - 100);
    } else {
      setMealProgress(newProgress);
    }
    
    return result;
  };

  const handleBackToLevels = () => {
    if (selectedMode === 'story') {
      setScreen('story_levels');
    } else {
      setScreen('levels');
    }
    setSelectedMaze(null);
    setSelectedStoryMaze(null);
  };

  const handleBackToAnimalSelect = () => {
    if (selectedMode === 'story') {
      setScreen('story_levels');
      setSelectedMaze(null);
      setSelectedStoryMaze(null);
    } else {
      setScreen('animal_select');
    }
  };

  const handleBackToModeSelect = () => {
    setScreen('mode_select');
    setSelectedAnimal(null);
    setSelectedMaze(null);
    setSelectedStoryMaze(null);
  };

  const handleBackToHome = () => {
    setScreen('mode_select');
    setSelectedMaze(null);
    setSelectedStoryMaze(null);
    setSelectedMode(null);
    setSelectedAnimal(null);
  };

  // Hardware back button handler
  const handleHardwareBack = useCallback(() => {
    if (screen === 'levels') {
      handleBackToAnimalSelect();
    } else if (screen === 'story_levels') {
      handleBackToModeSelect();
    } else if (screen === 'animal_select') {
      if (selectedMode === 'story') {
        setScreen('story_levels');
        setSelectedMaze(null);
        setSelectedStoryMaze(null);
      } else {
        handleBackToModeSelect();
      }
    } else if (screen === 'mode_select') {
      // Already at top level, do nothing
    }
  }, [screen, selectedMode]);

  useBackButton(handleHardwareBack, screen === 'levels' || screen === 'story_levels' || screen === 'mode_select' || screen === 'animal_select');

  // Count gold medals for board game rolls
  const goldMedalCount = Object.values(save.levels).filter(l => l.medal === 'gold').length;

  if (screen === 'board_game' && selectedAnimal) {
    const animal = animals.find(a => a.id === selectedAnimal);
    return (
      <BoardGameMode
        animalType={selectedAnimal}
        animalEmoji={animal?.emoji || '🐷'}
        goldMedals={goldMedalCount}
        onBack={handleBackToHome}
        onStarsEarned={async (stars) => {
          const s = await import('@/services/SaveManager').then(m => m.SaveManager);
          await s.addCurrency(stars);
          refresh();
        }}
        onFeedSent={async () => {
          await unlockMeal();
          refresh();
        }}
      />
    );
  }

  if (screen === 'playing' && selectedAnimal && selectedMaze) {
    return (
      <MazeGame3D
        maze={selectedMaze}
        animalType={selectedAnimal}
        debugMode={save.settings.debugMode}
        isMuted={save.settings.musicVolume === 0}
        onMuteChange={(muted) => updateSettings({ 
          musicVolume: muted ? 0 : 0.7,
          sfxVolume: muted ? 0 : 1.0 
        })}
        onComplete={handleGameComplete}
        onQuit={handleBackToHome}
        onBackToLevels={handleBackToLevels}
        onRestart={async () => {
          await startAttempt(selectedMaze.id);
        }}
        isStoryMode={selectedMode === 'story'}
        storyMaze={selectedStoryMaze}
        storyProgress={storyProgress}
        onObjectiveComplete={(objectiveId) => {
          setStoryProgress(prev => ({
            ...prev,
            activeObjectives: {
              ...prev.activeObjectives,
              [objectiveId]: true,
            },
          }));
        }}
        // Apple system props
        appleCount={appleCount}
        onAppleCollect={collectApple}
        onAppleFeed={feedApple}
        canFeedApple={canFeedApple}
        getApplesGivenCount={getApplesGivenCount}
        pendingAppleDialogue={pendingAppleDialogue}
        onAppleDialogueComplete={completePendingDialogue}
        friendshipProgress={undefined}
        berryCount={berryCount}
        onBerryCollect={(count) => setBerryCount(prev => prev + count)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        totalMeals={save.player.totalMealsUnlocked} 
        stars={save.player.currency} 
        appleCount={appleCount}
      />
      <main className="container max-w-4xl mx-auto px-4 py-8">
        {screen === 'mode_select' && (
          <ModeSelectScreen
            onSelectMode={handleModeSelect}
            onBack={handleBackToHome}
            storyProgress={{
              currentChapter: storyChapters.find(c => c.id === storyProgress.currentChapterId)?.title || 'Chapter 1',
              completedQuests: storyProgress.completedQuests.length,
              totalQuests: storyChapters.reduce((sum, c) => sum + c.quests.length, 0),
            }}
            isSoundOn={save.settings.musicVolume > 0}
            onSoundToggle={(on) => updateSettings({ 
              musicVolume: on ? 0.7 : 0,
              sfxVolume: on ? 1.0 : 0 
            })}
            debugMode={save.settings.debugMode}
            onDebugToggle={(on) => updateSettings({ debugMode: on })}
            mealsUnlocked={save.player.totalMealsUnlocked}
            mealProgress={mealProgress}
          />
        )}

        {screen === 'animal_select' && selectedMode && (
          <div className="space-y-6 animate-fade-in">
            {/* Back button */}
            <Button
              variant="ghost"
              onClick={selectedMode === 'story' ? () => { setScreen('story_levels'); setSelectedMaze(null); setSelectedStoryMaze(null); } : handleBackToModeSelect}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>

            {/* Title */}
            <div className="text-center space-y-2">
              <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
                Choose Your Animal
              </h1>
              <p className="text-muted-foreground">
                Who will explore the {selectedMode === 'story' ? 'story' : 'maze'} with you?
              </p>
            </div>

            {/* Animal Selection */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
              {animals.map((animal, index) => (
                <AnimalCard
                  key={animal.id}
                  animal={animal}
                  isSelected={selectedAnimal === animal.id}
                  isLocked={!save.player.unlockedAnimals.includes(animal.id)}
                  onClick={() => handleAnimalSelect(animal.id)}
                  delay={index + 1}
                />
              ))}
            </div>

            {/* Continue Button */}
            <div className="flex justify-center">
              <Button
                variant="sunset"
                size="lg"
                onClick={handleAnimalConfirm}
                disabled={!selectedAnimal}
                className="min-w-40"
              >
                Continue →
              </Button>
            </div>
          </div>
        )}

        {screen === 'levels' && selectedAnimal && (
          <LevelSelect
            mazes={mazes}
            onSelect={handleLevelSelect}
            onBack={handleBackToAnimalSelect}
            save={save}
            isMazeUnlocked={isMazeUnlocked}
            unlockMazeWithCurrency={unlockMazeWithCurrency}
            onRefreshSave={refresh}
          />
        )}

        {screen === 'story_levels' && (
          <StoryLevelSelect
            onSelect={handleStoryLevelSelect}
            onBack={handleBackToModeSelect}
            storyProgress={storyProgress}
            debugMode={save.settings.debugMode}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>Made with 💚 for farm animal sanctuaries everywhere</p>
      </footer>
    </div>
  );
};

export default Index;

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

// Flow: home -> mode_select -> animal_select -> levels/story_levels -> playing
type GameScreen = 'home' | 'mode_select' | 'animal_select' | 'levels' | 'story_levels' | 'playing';

const Index = () => {
  const { save, loading, refresh, startAttempt, completeLevel, addScore, unlockMeal, updateSettings, isMazeUnlocked, unlockMazeWithCurrency } = useSave();
  const { getAllMazes, isLoaded: mazesLoaded } = useMazeStorage();
  const { 
    appleCount, 
    collectApple, 
    feedApple, 
    canFeedApple,
    getFriendship, 
    getProgress, 
    addTestApples,
    pendingAppleDialogue,
    completePendingDialogue,
  } = useAppleSystem();
  const [screen, setScreen] = useState<GameScreen>('home');
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

  const handleStartGame = () => {
    setScreen('mode_select');
  };

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode);
    setScreen('animal_select');
  };

  const handleAnimalSelect = (animalId: AnimalType) => {
    setSelectedAnimal(animalId);
  };

  const handleAnimalConfirm = () => {
    if (!selectedAnimal || !selectedMode) return;
    
    if (selectedMode === 'story') {
      setScreen('story_levels');
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
    await startAttempt(maze.id);
    setScreen('playing');
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
    setScreen('animal_select');
  };

  const handleBackToModeSelect = () => {
    setScreen('mode_select');
    setSelectedAnimal(null);
  };

  const handleBackToHome = () => {
    setScreen('home');
    setSelectedMaze(null);
    setSelectedStoryMaze(null);
    setSelectedMode(null);
    setSelectedAnimal(null);
  };

  // Hardware back button handler
  const handleHardwareBack = useCallback(() => {
    if (screen === 'levels' || screen === 'story_levels') {
      handleBackToAnimalSelect();
    } else if (screen === 'animal_select') {
      handleBackToModeSelect();
    } else if (screen === 'mode_select') {
      handleBackToHome();
    }
  }, [screen]);

  useBackButton(handleHardwareBack, screen === 'levels' || screen === 'story_levels' || screen === 'mode_select' || screen === 'animal_select');

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
        pendingAppleDialogue={pendingAppleDialogue}
        onAppleDialogueComplete={completePendingDialogue}
        friendshipProgress={getProgress(selectedAnimal)}
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
        {screen === 'home' && (
          <div className="space-y-6 md:space-y-8">
            {/* Hero Section */}
            <div className="text-center space-y-2 md:space-y-4 animate-fade-in">
              <div className="text-4xl md:text-6xl mb-2 md:mb-4">🐷🐮🐔</div>
              <h1 className="font-display text-3xl md:text-5xl font-bold text-gradient">
                Foggy Farm
              </h1>
              <p className="text-sm md:text-lg text-muted-foreground max-w-md mx-auto">
                Navigate 3D corn mazes with adorable farm animals and help unlock
                real meals for sanctuary residents!
              </p>
            </div>

            {/* Start Button */}
            <div className="flex flex-col items-center gap-4 animate-fade-in-delay-1">
              <Button
                variant="sunset"
                size="xl"
                onClick={handleStartGame}
                className="min-w-48"
              >
                Start Adventure 🌾
              </Button>
              
              {/* Sound Toggle */}
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {save.settings.musicVolume > 0 ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
                <Switch
                  id="sound-toggle"
                  checked={save.settings.musicVolume > 0}
                  onCheckedChange={(checked) => updateSettings({ 
                    musicVolume: checked ? 0.7 : 0,
                    sfxVolume: checked ? 1.0 : 0 
                  })}
                />
                <Label htmlFor="sound-toggle" className="cursor-pointer">
                  Sound
                </Label>
              </div>
              
              {/* Debug Mode Toggle */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch
                  id="debug-mode"
                  checked={save.settings.debugMode}
                  onCheckedChange={(checked) => updateSettings({ debugMode: checked })}
                />
                <Label htmlFor="debug-mode" className="cursor-pointer">
                  Debug Mode (skip preview, infinite time)
                </Label>
              </div>
            </div>

            {/* Progress Tracker */}
            <div className="max-w-sm mx-auto animate-fade-in-delay-2">
              <ProgressTracker
                mealsUnlocked={save.player.totalMealsUnlocked}
                currentProgress={mealProgress}
                targetMeals={5}
              />
            </div>

            {/* How it works */}
            <div className="bg-card rounded-2xl p-6 shadow-warm animate-fade-in-delay-3">
              <h3 className="font-display text-lg font-bold text-foreground mb-4 text-center">
                Quick Overview
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                <div className="space-y-2">
                  <div className="text-3xl">👀</div>
                  <h4 className="font-semibold text-foreground">Memorize</h4>
                  <p className="text-sm text-muted-foreground">
                    Study the maze from above
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl">🌽</div>
                  <h4 className="font-semibold text-foreground">Explore 3D</h4>
                  <p className="text-sm text-muted-foreground">
                    Navigate from inside the corn maze
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl">📍</div>
                  <h4 className="font-semibold text-foreground">Find Stations</h4>
                  <p className="text-sm text-muted-foreground">
                    Lost? Find map stations for help
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl">🍽️</div>
                  <h4 className="font-semibold text-foreground">Unlock Meals</h4>
                  <p className="text-sm text-muted-foreground">
                    Feed real sanctuary animals
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === 'mode_select' && (
          <ModeSelectScreen
            onSelectMode={handleModeSelect}
            onBack={handleBackToHome}
            storyProgress={{
              currentChapter: storyChapters.find(c => c.id === storyProgress.currentChapterId)?.title || 'Chapter 1',
              completedQuests: storyProgress.completedQuests.length,
              totalQuests: storyChapters.reduce((sum, c) => sum + c.quests.length, 0),
            }}
          />
        )}

        {screen === 'animal_select' && selectedMode && (
          <div className="space-y-6 animate-fade-in">
            {/* Back button */}
            <Button
              variant="ghost"
              onClick={handleBackToModeSelect}
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

        {screen === 'story_levels' && selectedAnimal && (
          <StoryLevelSelect
            onSelect={handleStoryLevelSelect}
            onBack={handleBackToAnimalSelect}
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

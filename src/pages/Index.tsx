import { useState, useEffect } from 'react';
import { AnimalType, Maze } from '@/types/game';
import { animals } from '@/data/animals';
import { mazes } from '@/data/mazes';
import { AnimalCard } from '@/components/AnimalCard';
import { LevelSelect } from '@/components/LevelSelect';
import { MazeGame3D } from '@/components/MazeGame3D';
import { ProgressTracker } from '@/components/ProgressTracker';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSave } from '@/hooks/useSave';
import { Volume2, VolumeX } from 'lucide-react';

type GameScreen = 'home' | 'levels' | 'playing';

const Index = () => {
  const { save, loading, completeLevel, addScore, unlockMeal, updateSettings } = useSave();
  const [screen, setScreen] = useState<GameScreen>('home');
  const [selectedAnimal, setSelectedAnimal] = useState<AnimalType | null>(null);
  const [selectedMaze, setSelectedMaze] = useState<Maze | null>(null);
  const [mealProgress, setMealProgress] = useState(35);

  // Sync selected animal from save
  useEffect(() => {
    if (save.player.currentAnimal) {
      setSelectedAnimal(save.player.currentAnimal as AnimalType);
    }
  }, [save.player.currentAnimal]);

  const handleAnimalSelect = (animalId: AnimalType) => {
    setSelectedAnimal(animalId);
  };

  const handleStartGame = () => {
    if (selectedAnimal) {
      setScreen('levels');
    }
  };

  const handleLevelSelect = (maze: Maze) => {
    setSelectedMaze(maze);
    setScreen('playing');
  };

  const handleGameComplete = async (score: number, timeUsed: number) => {
    // Save level completion
    if (selectedMaze) {
      await completeLevel(selectedMaze.id, timeUsed);
    }
    
    // Update score
    await addScore(score);
    
    // Update meal progress
    const newProgress = mealProgress + Math.floor(score / 50);
    if (newProgress >= 100) {
      await unlockMeal();
      setMealProgress(newProgress - 100);
    } else {
      setMealProgress(newProgress);
    }
  };

  const handleBackToHome = () => {
    setScreen('home');
    setSelectedMaze(null);
  };

  // Full screen game view
  if (screen === 'playing' && selectedAnimal && selectedMaze) {
    return (
      <MazeGame3D
        maze={selectedMaze}
        animalType={selectedAnimal}
        debugMode={save.settings.debugMode}
        onComplete={handleGameComplete}
        onQuit={handleBackToHome}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header totalMeals={save.player.totalMealsUnlocked} score={save.player.totalScore} />

      <main className="container max-w-4xl mx-auto px-4 py-8">
        {screen === 'home' && (
          <div className="space-y-8">
            {/* Hero Section */}
            <div className="text-center space-y-4 animate-fade-in">
              <div className="text-6xl mb-4">🐷🐮🐔</div>
              <h1 className="font-display text-4xl md:text-5xl font-bold text-gradient">
                Sanctuary Run
              </h1>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Navigate 3D corn mazes with adorable farm animals and help unlock
                real meals for sanctuary residents!
              </p>
            </div>

            {/* Animal Selection */}
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-bold text-foreground text-center">
                Choose Your Animal
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>

            {/* Start Button */}
            <div className="flex flex-col items-center gap-4 animate-fade-in-delay-3">
              <Button
                variant="sunset"
                size="xl"
                onClick={handleStartGame}
                disabled={!selectedAnimal}
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
            <div className="max-w-sm mx-auto animate-fade-in-delay-3">
              <ProgressTracker
                mealsUnlocked={save.player.totalMealsUnlocked}
                currentProgress={mealProgress}
                targetMeals={5}
              />
            </div>

            {/* How it works */}
            <div className="bg-card rounded-2xl p-6 shadow-warm animate-fade-in-delay-3">
              <h3 className="font-display text-lg font-bold text-foreground mb-4 text-center">
                How It Works
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

        {screen === 'levels' && selectedAnimal && (
          <LevelSelect
            mazes={mazes}
            onSelect={handleLevelSelect}
            onBack={handleBackToHome}
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

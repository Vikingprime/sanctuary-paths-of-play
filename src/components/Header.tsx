import { Button } from '@/components/ui/button';

interface HeaderProps {
  totalMeals: number;
  score: number;
}

export const Header = ({ totalMeals, score }: HeaderProps) => {
  return (
    <header className="w-full py-4 px-6 flex items-center justify-between bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-3">
        <div className="text-3xl">🌾</div>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            Sanctuary Run
          </h1>
          <p className="text-xs text-muted-foreground">
            Help farm animals, one maze at a time
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full">
          <span>🍽️</span>
          <span className="font-display font-semibold text-foreground">
            {totalMeals}
          </span>
        </div>
        <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-full">
          <span>⭐</span>
          <span className="font-display font-semibold text-foreground">
            {score.toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  );
};

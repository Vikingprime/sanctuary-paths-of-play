interface HeaderProps {
  totalMeals: number;
  stars: number;
  appleCount: number;
}

export const Header = ({ totalMeals, stars, appleCount }: HeaderProps) => {
  return (
    <header className="w-full py-4 px-6 flex items-center justify-between bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="flex items-center gap-3">
        <div className="text-3xl">🌾</div>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            Foggy Farm
          </h1>
          <p className="text-xs text-muted-foreground">
            Help farm animals, one maze at a time
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 rounded-full">
          <span>🍎</span>
          <span className="font-display font-semibold text-foreground text-sm">
            {appleCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 rounded-full">
          <span>🍽️</span>
          <span className="font-display font-semibold text-foreground text-sm">
            {totalMeals}
          </span>
        </div>
        <div className="flex items-center gap-1.5 bg-muted px-2.5 py-1.5 rounded-full">
          <span>⭐</span>
          <span className="font-display font-semibold text-foreground text-sm">
            {(stars ?? 0).toLocaleString()}
          </span>
        </div>
      </div>
    </header>
  );
};

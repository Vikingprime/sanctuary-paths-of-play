import { Compass } from 'lucide-react';

interface CompassRoseProps {
  size?: number;
  className?: string;
}

// Simple compass rose icon showing N/S/E/W
export const CompassRose = ({ size = 60, className = '' }: CompassRoseProps) => {
  return (
    <div 
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Center compass icon */}
      <Compass className="text-primary" style={{ width: size * 0.5, height: size * 0.5 }} />
      
      {/* Cardinal directions */}
      <div 
        className="absolute font-display font-bold text-secondary"
        style={{ top: 0, left: '50%', transform: 'translateX(-50%)', fontSize: size * 0.2 }}
      >
        N
      </div>
      <div 
        className="absolute font-display font-bold text-muted-foreground"
        style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)', fontSize: size * 0.18 }}
      >
        S
      </div>
      <div 
        className="absolute font-display font-bold text-muted-foreground"
        style={{ left: 0, top: '50%', transform: 'translateY(-50%)', fontSize: size * 0.18 }}
      >
        W
      </div>
      <div 
        className="absolute font-display font-bold text-muted-foreground"
        style={{ right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: size * 0.18 }}
      >
        E
      </div>
    </div>
  );
};

import { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';

interface CompassOverlayProps {
  show: boolean;
  duration?: number; // How long to show in ms
  onHide?: () => void;
}

export const CompassOverlay = ({ 
  show, 
  duration = 4000, 
  onHide 
}: CompassOverlayProps) => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setFading(false);
      
      // Start fade out before hiding
      const fadeTimer = setTimeout(() => {
        setFading(true);
      }, duration - 500);
      
      // Hide completely
      const hideTimer = setTimeout(() => {
        setVisible(false);
        onHide?.();
      }, duration);
      
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [show, duration, onHide]);

  if (!visible) return null;

  return (
    <div 
      className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="bg-card/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-warm-lg flex flex-col items-center gap-2">
        {/* Compass rose */}
        <div className="relative w-24 h-24 sm:w-32 sm:h-32">
          {/* Compass icon in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Compass className="w-12 h-12 sm:w-16 sm:h-16 text-primary animate-pulse" />
          </div>
          
          {/* Cardinal directions */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 font-display font-bold text-lg sm:text-xl text-secondary">
            N
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 font-display font-bold text-lg sm:text-xl text-muted-foreground">
            S
          </div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 font-display font-bold text-lg sm:text-xl text-muted-foreground">
            W
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 font-display font-bold text-lg sm:text-xl text-muted-foreground">
            E
          </div>
        </div>
        
        <p className="text-sm sm:text-base text-muted-foreground font-display">
          North is ahead
        </p>
      </div>
    </div>
  );
};

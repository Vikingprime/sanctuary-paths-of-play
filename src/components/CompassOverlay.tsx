import { useEffect, useState, useRef, MutableRefObject } from 'react';

interface PlayerState {
  x: number;
  y: number;
  rotation: number;
}

interface CompassOverlayProps {
  show: boolean;
  duration?: number; // How long to show in ms
  onHide?: () => void;
  playerStateRef?: MutableRefObject<PlayerState>; // Player state ref for live rotation updates
}

export const CompassOverlay = ({ 
  show, 
  duration = 5000,
  onHide,
  playerStateRef,
}: CompassOverlayProps) => {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (show) {
      setVisible(true);
      setFading(false);
      
      // Clear any existing timers
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      
      // Start fade out before hiding
      fadeTimerRef.current = setTimeout(() => {
        setFading(true);
      }, duration - 1000); // Start fading 1 second before end
      
      // Hide completely
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        onHide?.();
      }, duration);
      
      // Start animation loop to read rotation from ref
      const updateRotation = () => {
        if (playerStateRef) {
          setCurrentRotation(playerStateRef.current.rotation);
        }
        animFrameRef.current = requestAnimationFrame(updateRotation);
      };
      animFrameRef.current = requestAnimationFrame(updateRotation);
      
      return () => {
        if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };
    }
  }, [show, duration, onHide, playerStateRef]);

  if (!visible) return null;

  // Calculate compass rotation based on player's facing direction
  // Player rotation is in game coordinates where 0 = North (+Z)
  // We need to rotate the compass needle to point in the player's facing direction
  // The needle rotates while N/S/E/W labels stay fixed
  const compassRotationDeg = (currentRotation * 180 / Math.PI);
  
  // Determine which direction is "ahead" based on player rotation
  const getDirectionLabel = (rotation: number): string => {
    // Normalize to 0-2PI
    let r = rotation % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    
    // 0 = N, PI/2 = E, PI = S, 3PI/2 = W
    if (r < Math.PI / 8 || r >= 15 * Math.PI / 8) return 'North';
    if (r < 3 * Math.PI / 8) return 'Northeast';
    if (r < 5 * Math.PI / 8) return 'East';
    if (r < 7 * Math.PI / 8) return 'Southeast';
    if (r < 9 * Math.PI / 8) return 'South';
    if (r < 11 * Math.PI / 8) return 'Southwest';
    if (r < 13 * Math.PI / 8) return 'West';
    return 'Northwest';
  };

  const directionLabel = getDirectionLabel(currentRotation);

  return (
    <div 
      className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-opacity duration-1000 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="bg-card/90 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-warm-lg flex flex-col items-center gap-2">
        {/* Rotating compass rose */}
        <div className="relative w-24 h-24 sm:w-28 sm:h-28">
          {/* Fixed cardinal labels (always show N at top of UI) */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 font-display font-bold text-base sm:text-lg text-secondary z-10">
            N
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 font-display font-bold text-base sm:text-lg text-muted-foreground z-10">
            S
          </div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 font-display font-bold text-base sm:text-lg text-muted-foreground z-10">
            W
          </div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 font-display font-bold text-base sm:text-lg text-muted-foreground z-10">
            E
          </div>
          
          {/* Rotating compass needle */}
          <div 
            className="absolute inset-0 flex items-center justify-center transition-transform duration-150 ease-out"
            style={{ transform: `rotate(${-compassRotationDeg}deg)` }}
          >
            {/* Compass needle pointing "up" (player's direction) */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20">
              {/* Diamond shape as compass needle */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="w-8 h-8 sm:w-10 sm:h-10 bg-primary/80 border-2 border-primary"
                  style={{ 
                    transform: 'rotate(45deg)',
                    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                  }}
                />
              </div>
              {/* Direction indicator line pointing up */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-6 sm:h-8 bg-primary rounded-full" />
            </div>
          </div>
        </div>
        
        <p className="text-sm sm:text-base text-muted-foreground font-display">
          {directionLabel} is ahead
        </p>
      </div>
    </div>
  );
};

import { useEffect, useState, useRef, MutableRefObject } from 'react';
import { Navigation } from 'lucide-react';

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
      }, duration - 1000);
      
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

  // Calculate compass rotation - needle points to where player is facing
  const compassRotationDeg = (currentRotation * 180 / Math.PI);
  
  // Determine which direction is "ahead" based on player rotation
  const getDirectionLabel = (rotation: number): string => {
    let r = rotation % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    
    if (r < Math.PI / 8 || r >= 15 * Math.PI / 8) return 'N';
    if (r < 3 * Math.PI / 8) return 'NE';
    if (r < 5 * Math.PI / 8) return 'E';
    if (r < 7 * Math.PI / 8) return 'SE';
    if (r < 9 * Math.PI / 8) return 'S';
    if (r < 11 * Math.PI / 8) return 'SW';
    if (r < 13 * Math.PI / 8) return 'W';
    return 'NW';
  };

  const directionLabel = getDirectionLabel(currentRotation);

  return (
    <div 
      className={`absolute top-20 left-4 z-30 pointer-events-none transition-opacity duration-1000 ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="bg-card/80 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
        {/* Arrow pointing UP = "you are facing this direction" */}
        <Navigation 
          className="w-5 h-5 text-secondary fill-secondary/30" 
          strokeWidth={2.5}
        />
        
        {/* Direction label - shows which way you're facing */}
        <span className="text-sm font-display font-semibold text-foreground min-w-[24px]">
          {directionLabel}
        </span>
      </div>
    </div>
  );
};

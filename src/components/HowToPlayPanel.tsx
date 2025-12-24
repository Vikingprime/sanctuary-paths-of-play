import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Hand, MessageSquare, MapPin } from 'lucide-react';
import gameplayDemo from '@/assets/gameplay-demo.png';

interface HowToPlayPanelProps {
  defaultExpanded?: boolean;
}

export const HowToPlayPanel = ({ defaultExpanded = false }: HowToPlayPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-card rounded-2xl shadow-warm overflow-hidden animate-fade-in-delay-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <h3 className="font-display text-lg font-bold text-foreground">
            Controls & Instructions
          </h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="p-6 pt-2 space-y-6 animate-fade-in">
          {/* Mobile Controls Demo */}
          <div className="space-y-4">
            <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Hand className="h-5 w-5 text-primary" />
              Mobile Controls
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Animated Demo */}
              <div className="bg-muted/50 rounded-xl p-4 flex items-center justify-center min-h-[160px] relative overflow-hidden">
                <SwipeDemoAnimation />
              </div>
              
              {/* Instructions List */}
              <div className="space-y-3">
                <ControlInstruction
                  icon="👆"
                  title="Swipe to Move"
                  description="Drag your finger across the screen to move your animal through the maze"
                />
                <ControlInstruction
                  icon="👈👉"
                  title="Swipe Left/Right"
                  description="Turn left or right to change direction"
                />
                <ControlInstruction
                  icon="👆👇"
                  title="Swipe Up/Down"
                  description="Move forward or backward"
                />
              </div>
            </div>
          </div>

          {/* Gameplay Tips */}
          <div className="space-y-4">
            <h4 className="font-display font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              How to Play
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TipCard
                icon="👀"
                title="Memorize First"
                description="You'll see a top-down view of the maze before starting. Study it!"
              />
              <TipCard
                icon="🧑‍🌾"
                title="Talk to Characters"
                description="Approach characters to hear their stories and complete objectives"
              />
              <TipCard
                icon="🗺️"
                title="Find Map Stations"
                description="Look for stations marked with 'H' to view the map if you're lost"
              />
              <TipCard
                icon="⚡"
                title="Use Your Ability"
                description="Each animal has a special ability - use it wisely!"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Animated swipe demo with gameplay screenshot
const SwipeDemoAnimation = () => {
  return (
    <div className="relative w-32 h-40">
      {/* Phone outline */}
      <div className="absolute inset-0 border-2 border-primary/30 rounded-2xl bg-background/50 overflow-hidden">
        {/* Cropped gameplay image - showing middle section */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${gameplayDemo})`,
            backgroundSize: '120%',
            backgroundPosition: 'center 50%',
          }}
        />
        {/* Gradient overlays to fade top and bottom */}
        <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background/90 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background/90 to-transparent" />
      </div>
      
      {/* Animated finger with swipe trail */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="animate-swipe-demo absolute w-8 h-8 flex items-center justify-center">
          <div className="text-2xl drop-shadow-lg">👆</div>
        </div>
        {/* Swipe trail */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 128 160">
          <path
            d="M 64 130 Q 64 80 64 50"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="80"
            className="animate-swipe-trail"
          />
        </svg>
      </div>
      
      {/* Direction arrows */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 text-primary text-sm animate-pulse">↑</div>
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-muted-foreground text-sm">↓</div>
      <div className="absolute top-1/2 -left-2 -translate-y-1/2 text-muted-foreground text-sm">←</div>
      <div className="absolute top-1/2 -right-2 -translate-y-1/2 text-muted-foreground text-sm">→</div>
    </div>
  );
};

// Individual control instruction
const ControlInstruction = ({ icon, title, description }: { icon: string; title: string; description: string }) => (
  <div className="flex items-start gap-3">
    <span className="text-xl flex-shrink-0">{icon}</span>
    <div>
      <p className="font-semibold text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  </div>
);

// Tip card component
const TipCard = ({ icon, title, description }: { icon: string; title: string; description: string }) => (
  <div className="bg-muted/30 rounded-xl p-3 flex items-start gap-3">
    <span className="text-2xl flex-shrink-0">{icon}</span>
    <div>
      <p className="font-semibold text-foreground text-sm">{title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  </div>
);

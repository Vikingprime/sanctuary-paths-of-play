import { memo } from 'react';

interface AppleHUDModelProps {
  size?: number;
}

export const AppleHUDModel = memo(({ size = 80 }: AppleHUDModelProps) => {
  return (
    <div 
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size * 0.75}px`,
      }} 
      className="pointer-events-none select-none"
    >
      🍎
    </div>
  );
});

AppleHUDModel.displayName = 'AppleHUDModel';

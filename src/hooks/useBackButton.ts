import { useEffect } from 'react';

/**
 * Hook to handle hardware back button on mobile (Android/iOS)
 * Uses browser history API which Capacitor bridges to native back button
 */
export const useBackButton = (onBack: () => void, enabled: boolean = true) => {
  useEffect(() => {
    if (!enabled) return;
    
    // Push a dummy state so we have something to "go back" from
    const stateId = `back-handler-${Date.now()}`;
    window.history.pushState({ id: stateId }, '');
    
    const handlePopState = (event: PopStateEvent) => {
      // Prevent default navigation and call our handler
      onBack();
      
      // Re-push state to keep the handler active for next back press
      window.history.pushState({ id: stateId }, '');
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onBack, enabled]);
};


import { useState, useEffect, useCallback } from 'react';

// Tailwind breakpoints
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Hook to check if the current viewport matches a media query
 * @param query - Media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Use addEventListener for modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [query]);

  return matches;
}

/**
 * Hook to check if the viewport is below a certain breakpoint
 * @param breakpoint - Tailwind breakpoint name (sm, md, lg, xl, 2xl)
 * @returns boolean indicating if viewport is below the breakpoint
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const maxWidth = BREAKPOINTS[breakpoint];
  return useMediaQuery(`(max-width: ${maxWidth - 1}px)`);
}

/**
 * Hook to detect if the user is on a mobile device
 * This considers both viewport width and touch capability
 * @returns object with isMobile and isTouchDevice flags
 */
export function useIsMobile(): {
  isMobile: boolean;
  isTouchDevice: boolean;
  isTablet: boolean;
  isDesktop: boolean;
} {
  const isBelowMd = useBreakpoint('md');
  const isBelowLg = useBreakpoint('lg');
  
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check for touch capability
    const hasTouch = 'ontouchstart' in window || 
      navigator.maxTouchPoints > 0 ||
      // @ts-ignore - for older browsers
      navigator.msMaxTouchPoints > 0;
    
    setIsTouchDevice(hasTouch);
  }, []);

  return {
    isMobile: isBelowMd,
    isTouchDevice,
    isTablet: !isBelowMd && isBelowLg,
    isDesktop: !isBelowLg,
  };
}

/**
 * Simple hook that just returns if we're on mobile viewport
 * This is the most commonly used hook
 */
export function useMobile(): boolean {
  return useBreakpoint('md');
}

/**
 * Hook to get current viewport dimensions
 * Updates on resize with debounce for performance
 */
export function useViewportSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: ReturnType<typeof setTimeout>;
    
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, 100); // Debounce 100ms
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return size;
}

/**
 * Hook to detect scroll direction (useful for hiding/showing mobile nav)
 */
export function useScrollDirection(): 'up' | 'down' | null {
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      const direction = scrollY > lastScrollY ? 'down' : 'up';
      
      // Only update if scroll difference is significant (10px threshold)
      if (Math.abs(scrollY - lastScrollY) > 10) {
        setScrollDirection(direction);
        setLastScrollY(scrollY);
      }
    };

    window.addEventListener('scroll', updateScrollDirection, { passive: true });
    return () => window.removeEventListener('scroll', updateScrollDirection);
  }, [lastScrollY]);

  return scrollDirection;
}

/**
 * Hook to lock body scroll (useful for modals/bottom sheets on mobile)
 */
export function useLockBodyScroll(lock: boolean): void {
  useEffect(() => {
    if (!lock) return;
    
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    
    // Get scrollbar width to prevent layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, [lock]);
}

/**
 * Hook to detect if keyboard is open on mobile (iOS/Android)
 * This is useful for adjusting UI when virtual keyboard appears
 */
export function useKeyboardOpen(): boolean {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const { height: viewportHeight } = useViewportSize();
  const [initialHeight, setInitialHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (initialHeight === null) {
      setInitialHeight(window.innerHeight);
    }
  }, []);

  useEffect(() => {
    if (initialHeight === null) return;
    
    // If viewport height decreased significantly, keyboard is likely open
    const heightDifference = initialHeight - viewportHeight;
    const keyboardThreshold = 150; // Minimum height difference to consider keyboard open
    
    setIsKeyboardOpen(heightDifference > keyboardThreshold);
  }, [viewportHeight, initialHeight]);

  return isKeyboardOpen;
}

/**
 * Hook to detect orientation
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    if (typeof window === 'undefined') return 'portrait';
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOrientationChange = () => {
      setOrientation(
        window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
      );
    };

    // Try modern orientation API first
    if (screen.orientation) {
      screen.orientation.addEventListener('change', handleOrientationChange);
      return () => screen.orientation.removeEventListener('change', handleOrientationChange);
    }

    // Fallback to resize event
    window.addEventListener('resize', handleOrientationChange);
    return () => window.removeEventListener('resize', handleOrientationChange);
  }, []);

  return orientation;
}

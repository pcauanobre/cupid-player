'use client';

import { useEffect, useState } from 'react';

/**
 * Mount-aware open/close transition.
 * - `shouldRender` flips to true the moment we want the element on screen and
 *   stays true through the exit animation
 * - `phase` is 'enter' while open and 'exit' while closing — apply both as
 *   classes so CSS can transition between the two states
 */
export default function useTransition(visible: boolean, duration = 240) {
  const [shouldRender, setShouldRender] = useState(visible);
  const [phase, setPhase] = useState<'enter' | 'exit'>(visible ? 'enter' : 'exit');

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      // Wait one frame so the element mounts with the 'exit' class first
      // and the CSS transition has somewhere to animate from.
      const t = requestAnimationFrame(() => setPhase('enter'));
      return () => cancelAnimationFrame(t);
    }
    setPhase('exit');
    const t = setTimeout(() => setShouldRender(false), duration);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, duration]);

  return { shouldRender, phase } as const;
}

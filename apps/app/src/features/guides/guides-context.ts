import { createContext, use } from 'react';

import type { Guide } from './guides';

export const GuidesContext = createContext<{ startGuide: (guide: Guide) => void } | null>(null);

export function useStartGuide() {
  const context = use(GuidesContext);
  if (!context) throw new Error('useStartGuide needs a GuidesProvider.');
  return context.startGuide;
}

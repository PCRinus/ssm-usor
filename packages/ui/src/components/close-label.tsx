import { createContext, useContext } from 'react';

// The member app's language; the English admin (ADR 038) and the bilingual portal set theirs
// at their root.
export const CloseLabelContext = createContext('Închide');

export function useCloseLabel(label?: string) {
  const fallback = useContext(CloseLabelContext);
  return label ?? fallback;
}

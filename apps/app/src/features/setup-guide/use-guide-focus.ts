import { type RefObject, useEffect } from 'react';

import { type GuideFocusTarget, useSetupGuide } from './setup-guide-context';

// Every state change of the guide unmounts the control that caused it.
export function useGuideFocus(target: GuideFocusTarget | null, ref: RefObject<HTMLElement | null>) {
  const { focusRequest, focusHandled } = useSetupGuide();
  useEffect(() => {
    if (!target || focusRequest !== target || !ref.current) return;
    ref.current.focus();
    focusHandled();
  }, [target, focusRequest, focusHandled, ref]);
}

import { useLocation } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';

import { scrollAndFocus } from '@/features/missing-data/focus';

export function useImportAttention(ready = true, section?: string) {
  const hash = useLocation({ select: (location) => location.hash });
  const navigation = useLocation({
    select: (location) => location.state.__TSR_key ?? location.href,
  });
  const handled = useRef<string | null>(null);
  const stop = useRef<() => void>(() => {});
  const reveal = useCallback((anchors: string[]) => {
    const targets = anchors
      .map((anchor) => document.getElementById(anchor))
      .filter((element): element is HTMLElement => element !== null)
      .sort((left, right) =>
        left === right
          ? 0
          : left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1
      );
    const target = targets[0];
    if (!target) return;
    stop.current();
    stop.current = scrollAndFocus(target);
  }, []);

  useEffect(() => {
    const destination = `${navigation}:${section ?? ''}`;
    if (!ready || !hash.startsWith('review-') || handled.current === destination) return;
    if (!document.getElementById(hash)) return;
    handled.current = destination;
    reveal([hash]);
  }, [ready, hash, navigation, reveal, section]);

  useEffect(() => () => stop.current(), [navigation]);
  return reveal;
}

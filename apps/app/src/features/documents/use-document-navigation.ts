import type { DocxEditorNavigationProps, NavigationTabValue } from '@docx-editor.dev/react';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const phoneWidth = '(width <= 40rem)';
const findInput = '#docx-nav-panel-find .docx-nav__search-input';

function isFindShortcut(event: KeyboardEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'f'
  );
}

function insidePane(target: EventTarget | null) {
  return target instanceof Element && target.closest('.docx-nav') !== null;
}

// The editor lays out only the pages near the viewport, so the browser's own find misses most of
// a long document; while a document is open, Cmd+F and Ctrl+F open the editor's search instead.
export function useDocumentNavigation(ready: RefObject<boolean>) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NavigationTabValue>('headings');
  const [findRequest, setFindRequest] = useState(0);
  const returnTo = useRef<HTMLElement | null>(null);

  const remember = useCallback(() => {
    const focused = document.activeElement;
    returnTo.current = focused instanceof HTMLElement && !insidePane(focused) ? focused : null;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const target = returnTo.current;
    returnTo.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, []);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    remember();
    setOpen(true);
  }, [open, close, remember]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ready.current || event.isComposing) return;
      if (event.key === 'Escape') {
        if (open && insidePane(event.target)) {
          event.preventDefault();
          close();
        }
        return;
      }
      if (!isFindShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!open) remember();
      setOpen(true);
      setTab('find');
      setFindRequest((request) => request + 1);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [ready, open, close, remember]);

  useEffect(() => {
    if (findRequest === 0) return;
    const input = document.querySelector<HTMLInputElement>(findInput);
    input?.focus();
    input?.select();
  }, [findRequest]);

  // On a phone the pane covers the page, so what was picked is shown by closing it.
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.docx-nav__heading, .docx-nav__result') &&
        window.matchMedia(phoneWidth).matches
      ) {
        close();
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open, close]);

  const navigation = useMemo<DocxEditorNavigationProps>(
    () => ({
      open,
      tab,
      toggle: false,
      onOpenChange: (next) => (next ? setOpen(true) : close()),
      onTabChange: setTab,
    }),
    [open, tab, close]
  );

  return { navigation, open, toggle };
}

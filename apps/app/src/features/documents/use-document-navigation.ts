import type { DocxEditorNavigationProps, NavigationTabValue } from '@docx-editor.dev/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const pane = '.docx-nav';
const findInput = '#docx-nav-panel-find .docx-nav__search-input';
const documentContent = '.docx-pages, .docx-editor-one-surface__viewport';

// Ctrl+F on a Mac moves the cursor one letter forward in text, so there only Cmd+F searches.
function isFindShortcut(event: KeyboardEvent) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'f'
  );
}

function within(target: EventTarget | null, selector: string) {
  return target instanceof Element && target.closest(selector) !== null;
}

// The editor lays out only the pages near the viewport, so the browser's own find misses most of
// a long document. As in Excel for the web, Cmd+F searches the document when the focus is in
// it, and is the browser's everywhere else.
export function useDocumentNavigation() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NavigationTabValue>('headings');
  const [findRequest, setFindRequest] = useState(0);
  const returnTo = useRef<HTMLElement | null>(null);

  const remember = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && !within(focused, pane)) returnTo.current = focused;
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const focused = document.activeElement;
    const target = returnTo.current;
    returnTo.current = null;
    const focusLeftWithPane =
      focused === null || focused === document.body || within(focused, pane);
    if (focusLeftWithPane && target?.isConnected) target.focus({ preventScroll: true });
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
      if (event.isComposing || !isFindShortcut(event)) return;
      const focused = document.activeElement;
      const inSearch = within(focused, findInput);
      if (!inSearch && !within(focused, documentContent)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!inSearch) remember();
      setOpen(true);
      setTab('find');
      setFindRequest((request) => request + 1);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [remember]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      // Moving to a result selects it in the document, which takes the focus; stepping through
      // results with Enter keeps typing in the box.
      if (event.key === 'Enter' && within(event.target, findInput)) {
        const input = event.target as HTMLInputElement;
        window.setTimeout(() => {
          if (document.activeElement !== input) input.focus({ preventScroll: true });
        });
      }
      // Listened to after the editor's own popups, which take Esc first and mark it handled.
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !within(event.target, '[role="dialog"]')
      ) {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (findRequest === 0) return;
    const input = document.querySelector<HTMLInputElement>(findInput);
    input?.focus();
    input?.select();
  }, [findRequest]);

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

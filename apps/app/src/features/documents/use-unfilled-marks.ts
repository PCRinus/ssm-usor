import {
  type TextMatch,
  useDocxEditor,
  useEditorEvent,
  useHighlights,
} from '@docx-editor.dev/react';
import { unfilledMark } from '@ssm-usor/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

const recountDelayMs = 150;
const noMatches: readonly TextMatch[] = [];
const highlight = {
  color: 'var(--app-unfilled-mark)',
  activeColor: 'var(--app-unfilled-mark-active)',
};

type Selected = { match: TextMatch; index: number };

function isAt(match: TextMatch, at: TextMatch) {
  return match.blockId === at.blockId && match.start === at.start && match.scope === at.scope;
}

export interface UnfilledMarks {
  count: number;
  // The selected mark's place among those left, or -1 once it is typed over or none was chosen.
  active: number;
  stepping: boolean;
  next: () => void;
  showFirst: () => void;
  stopStepping: () => void;
}

// The editor's own search is one session shared with the Find pane: its query, its match-case
// and its count would follow whatever the person searched for there. The marks are found apart.
//
// Formatting the mark in the file itself, red or highlighted, was the other way: what is typed
// over it inherits the formatting, here and in Word, and the price is issued in red.
//
// `ready` is the editor's report that the document is laid out: before it the search finds
// nothing, and a document nobody has edited yet sends no change to count again on. Mounted once
// per editor, since a second owner would register the highlights twice.
export function useUnfilledMarks(ready: boolean): UnfilledMarks {
  const editor = useDocxEditor();
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [stepping, setStepping] = useState(false);
  const [showingFirst, setShowingFirst] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEditorEvent('change', () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRevision((count) => count + 1), recountDelayMs);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const matches = useMemo(
    () => (editor && ready ? editor.findMatches(unfilledMark, { matchCase: true }) : noMatches),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the document changes inside the editor; the revision says it did
    [editor, ready, revision]
  );
  const active = selected ? matches.findIndex((match) => isAt(match, selected.match)) : -1;
  const options = useMemo(() => ({ ...highlight, activeIndex: active }), [active]);
  useHighlights('unfilled', matches, options);

  if (stepping && matches.length === 0) setStepping(false);

  // Once the selected mark is typed over, the marks after it move up one place, so the one at
  // its old place is the next to fill.
  const nextIndex = active >= 0 ? active + 1 : selected ? selected.index : 0;

  function select(index: number) {
    const match = matches[index];
    if (!match || !editor?.selectMatch(match).ok) return;
    setSelected({ match, index });
    // Selecting places the selection without the focus, which a closing menu or a tapped button
    // has left elsewhere, and what is typed would not replace the mark.
    editor.focus();
  }

  // A frame after the strip opens, once the page has moved down to make room for it: selecting
  // scrolls the mark into view, and before that it could land behind the strip's height.
  useEffect(() => {
    if (!showingFirst) return;
    const frame = window.requestAnimationFrame(() => {
      setShowingFirst(false);
      select(0);
    });
    return () => window.cancelAnimationFrame(frame);
  });

  return {
    count: matches.length,
    active,
    stepping,
    next: () => {
      if (matches.length > 0) select(nextIndex % matches.length);
    },
    showFirst: () => {
      if (matches.length === 0) return;
      setStepping(true);
      setShowingFirst(true);
    },
    stopStepping: () => setStepping(false),
  };
}

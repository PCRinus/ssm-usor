import {
  type TextMatch,
  useDocxEditor,
  useEditorEvent,
  useHighlights,
} from '@docx-editor.dev/react';
import { countOf, unfilledMark } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { TriangleAlert } from 'lucide-react';
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

// The editor's own search is one session shared with the Find pane: its query, its match-case
// and its count would follow whatever the person searched for there. The marks are found apart.
//
// Formatting the mark in the file itself, red or highlighted, was the other way: what is typed
// over it inherits the formatting, here and in Word, and the price is issued in red.
//
// `ready` is the editor's report that the document is laid out: before it the search finds
// nothing, and a document nobody has edited yet sends no change to count again on.
export function UnfilledNavigator({ ready }: { ready: boolean }) {
  const editor = useDocxEditor();
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);
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

  if (matches.length === 0) return null;

  // Once the selected mark is typed over, the marks after it move up one place, so the one at
  // its old place is the next to fill.
  const nextIndex = active >= 0 ? active + 1 : selected ? selected.index : 0;

  function next() {
    const index = nextIndex % matches.length;
    const match = matches[index];
    if (match && editor?.selectMatch(match).ok) setSelected({ match, index });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="editor-unfilled"
      title={`Selectează următorul „${unfilledMark}”; ce scrii îl înlocuiește.`}
      className="border-warning-border bg-warning text-warning-foreground hover:bg-warning/70 hover:text-warning-foreground"
      onClick={next}
    >
      <TriangleAlert aria-hidden="true" />
      {countOf(matches.length, 'loc', 'locuri')} de completat
      <span className="font-normal">
        {active < 0 ? '· arată' : `· ${active + 1} din ${matches.length}`}
      </span>
    </Button>
  );
}

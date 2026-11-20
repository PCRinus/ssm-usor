import {
  type TextMatch,
  useDocxEditor,
  useEditorEvent,
  useEditorState,
  useHighlights,
} from '@docx-editor.dev/react';
import { countOf, unfilledMark } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const recountDelayMs = 150;
const noMatches: readonly TextMatch[] = [];

function sameMark(previous: TextMatch | undefined, matches: readonly TextMatch[]) {
  if (!previous) return -1;
  let found = -1;
  let distance = Infinity;
  matches.forEach((match, index) => {
    const from = Math.abs(match.start - previous.start);
    if (match.blockId === previous.blockId && from < distance) {
      found = index;
      distance = from;
    }
  });
  return found;
}

// The editor's own search is one session shared with the Find pane: its query, its match-case
// and its count would follow whatever the person searched for there. The marks are found apart.
//
// Formatting the mark in the file itself, red or highlighted, was the other way: what is typed
// over it inherits the formatting, here and in Word, and the price is issued in red.
export function UnfilledNavigator() {
  const editor = useDocxEditor();
  const opened = useEditorState((state) => !state.isLoading && state.isOpening !== true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<TextMatch | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEditorEvent('change', () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setRevision((count) => count + 1), recountDelayMs);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const matches = useMemo(
    () => (editor && opened ? editor.findMatches(unfilledMark, { matchCase: true }) : noMatches),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the document changes inside the editor; the revision says it did
    [editor, opened, revision]
  );
  const active = sameMark(selected ?? undefined, matches);
  const highlight = useMemo(() => ({ activeIndex: active }), [active]);
  useHighlights('unfilled', matches, highlight);

  if (matches.length === 0) return null;

  function next() {
    const match = matches[(active + 1) % matches.length];
    if (match && editor?.selectMatch(match).ok) setSelected(match);
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

import '@docx-editor.dev/core/styles/editor.css';
import './source-word-view.css';

import { packagedFonts } from '@docx-editor.dev/fonts';
import {
  DocxEditor,
  type Editor,
  useDocxEditor,
  useEditorState,
  useHighlights,
} from '@docx-editor.dev/react';
import { type RefObject, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';
import { editorStrings } from '@/features/documents/editor-strings.ro';

import { findLine, lineOccurrences, passageHits, quoteLines } from './source-match';
import { holdPassage } from './source-word-passage';

const fonts = packagedFonts({ allow: ['Arial'] });

type Range = { blockId: string; start: number; length: number };

const paintWaitMs = 15_000;

function QuotePassage({
  ranges,
  host,
  onPainted,
}: {
  ranges: Range[];
  host: RefObject<HTMLDivElement | null>;
  onPainted: () => void;
}) {
  useHighlights('import-quote', ranges, { priority: 20 });
  const editor = useDocxEditor();
  const failed = useEditorState((state) => state.parseError !== null);
  const reportPainted = useEffectEvent(onPainted);
  // The editor tells of no paint, and its snapshot calls the document open before a page is laid
  // out, so the first page drawn is the sign.
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    if (failed) {
      reportPainted();
      return;
    }
    const started = performance.now();
    let frame = 0;
    const look = () => {
      if (root.querySelector('.docx-page') || performance.now() - started > paintWaitMs) {
        reportPainted();
      } else frame = requestAnimationFrame(look);
    };
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [failed, host]);
  useEffect(() => {
    const viewport = host.current?.querySelector<HTMLElement>('.docx-editor-one-surface__viewport');
    if (!editor || ranges.length === 0 || !viewport) return;
    return holdPassage(viewport, { fontsPending: () => editor.fontMeasurement().resolving });
  }, [editor, ranges, host]);
  return null;
}

// Each answer carries a link signed anew, so the document is held by its file: stepping to
// another passage in it only moves the mark.
export default function WordSourceView({
  source,
  quote,
  onNotFound,
  onShown,
}: {
  source: ImportSourceResponse;
  quote: string;
  onNotFound: () => void;
  onShown: () => void;
}) {
  const [loaded, setLoaded] = useState<{ fileId: string; bytes: Uint8Array } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const reportNotFound = useEffectEvent(() => onNotFound());
  const reportShown = useEffectEvent(() => onShown());
  const { fileId } = source;
  const url = source.derived?.url ?? source.original.url;
  const bytes = loaded?.fileId === fileId ? loaded.bytes : null;
  const held = bytes !== null;
  const failed = !held && failedUrl === url;

  useEffect(() => {
    if (held) return;
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) setLoaded({ fileId, bytes: new Uint8Array(buffer) });
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [url, fileId, held]);

  useEffect(() => {
    if (failed) reportShown();
  }, [failed]);

  const passage = useMemo(
    () =>
      editor
        ? passageHits(
            quoteLines(source, quote),
            (line) => findLine(line, (query) => editor.findMatches(query)),
            lineOccurrences(source, quote)
          )
        : null,
    [editor, source, quote]
  );
  const ranges = useMemo(
    () => passage?.hits.map(({ blockId, start, length }) => ({ blockId, start, length })) ?? [],
    [passage]
  );
  useEffect(() => {
    if (!editor || !passage) return;
    // The editor paints a highlight only once its page is in view.
    if (passage.anchor) editor.scrollToBlock(passage.anchor.blockId);
    else reportNotFound();
  }, [editor, passage]);

  if (failed) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        Documentul nu a putut fi deschis aici. Descarcă originalul ca să-l vezi.
      </p>
    );
  }
  if (!bytes) return null;
  return (
    <div ref={host} className="flex h-full min-h-0 flex-col" data-testid="source-word">
      <DocxEditor
        document={bytes}
        mode="view"
        className="min-h-0 flex-1"
        chrome={false}
        menu={false}
        rulers={false}
        navigation={false}
        locale="ro-RO"
        i18n={editorStrings}
        fonts={fonts}
        onReady={setEditor}
      >
        <QuotePassage ranges={ranges} host={host} onPainted={onShown} />
      </DocxEditor>
    </div>
  );
}

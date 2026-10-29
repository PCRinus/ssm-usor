import '@docx-editor.dev/core/styles/editor.css';
import './source-word-view.css';

import { packagedFonts } from '@docx-editor.dev/fonts';
import { DocxEditor, useDocxEditor, useHighlights } from '@docx-editor.dev/react';
import { type RefObject, useEffect, useRef, useState } from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';
import { editorStrings } from '@/features/documents/editor-strings.ro';

import { findLine, passageHits, quoteLines } from './source-match';
import { holdPassage } from './source-word-passage';

const fonts = packagedFonts({ allow: ['Arial'] });

type Range = { blockId: string; start: number; length: number };

function QuotePassage({
  ranges,
  host,
}: {
  ranges: Range[];
  host: RefObject<HTMLDivElement | null>;
}) {
  useHighlights('import-quote', ranges, { priority: 20 });
  const editor = useDocxEditor();
  useEffect(() => {
    const viewport = host.current?.querySelector<HTMLElement>('.docx-editor-one-surface__viewport');
    if (!editor || ranges.length === 0 || !viewport) return;
    return holdPassage(viewport, { fontsPending: () => editor.fontMeasurement().resolving });
  }, [editor, ranges, host]);
  return null;
}

export default function WordSourceView({
  source,
  quote,
  onNotFound,
}: {
  source: ImportSourceResponse;
  quote: string;
  onNotFound: () => void;
}) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [ranges, setRanges] = useState<Range[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const url = source.derived?.url ?? source.original.url;
  const failed = failedUrl === url;

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (!cancelled) setBytes(new Uint8Array(buffer));
      })
      .catch(() => {
        if (!cancelled) setFailedUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        Documentul nu a putut fi deschis aici. Descarcă originalul ca să-l vezi.
      </p>
    );
  }
  if (!bytes) {
    return (
      <p className="p-6 text-sm text-muted-foreground" role="status">
        Se deschide documentul…
      </p>
    );
  }
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
        onReady={(editor) => {
          const { hits, anchor } = passageHits(quoteLines(source, quote), (line) =>
            findLine(line, (query) => editor.findMatches(query))
          );
          setRanges(hits.map(({ blockId, start, length }) => ({ blockId, start, length })));
          // The editor paints a highlight only once its page is in view.
          if (anchor) editor.scrollToBlock(anchor.blockId);
          else onNotFound();
        }}
      >
        <QuotePassage ranges={ranges} host={host} />
      </DocxEditor>
    </div>
  );
}

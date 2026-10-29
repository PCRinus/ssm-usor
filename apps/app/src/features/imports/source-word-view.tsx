import '@docx-editor.dev/core/styles/editor.css';

import { packagedFonts } from '@docx-editor.dev/fonts';
import { DocxEditor, useHighlights } from '@docx-editor.dev/react';
import { useEffect, useRef, useState } from 'react';

import type { ImportSourceResponse } from '@/api/generated/api';
import { editorStrings } from '@/features/documents/editor-strings.ro';

import { passageHits, quoteLines } from './source-match';

const fonts = packagedFonts({ allow: ['Arial'] });

type Range = { blockId: string; start: number; length: number };

function QuoteHighlights({ ranges }: { ranges: Range[] }) {
  useHighlights('import-quote', ranges, { priority: 20 });
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
  const [failed, setFailed] = useState(false);
  const [ranges, setRanges] = useState<Range[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const url = source.derived?.url ?? source.original.url;

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
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // The editor paints a highlight only once its page is in view, so the passage is centred
  // after the scroll to its block, not with it.
  useEffect(() => {
    if (ranges.length === 0) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        host.current?.querySelector('.docx-text-highlight')?.scrollIntoView?.({ block: 'center' });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [ranges]);

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
            editor.findMatches(line)
          );
          setRanges(hits.map(({ blockId, start, length }) => ({ blockId, start, length })));
          if (anchor) editor.scrollToBlock(anchor.blockId);
          else onNotFound();
        }}
      >
        <QuoteHighlights ranges={ranges} />
      </DocxEditor>
    </div>
  );
}

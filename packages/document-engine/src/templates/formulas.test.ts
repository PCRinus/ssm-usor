import {
  createPackagedFileFetch,
  openFontBackedDocumentForExport,
} from '@docx-editor.dev/core/export';
import { HARD_MAX_FONT_BYTES } from '@docx-editor.dev/core/layout';
import { FONT_ASSET_ROOT, packagedFonts } from '@docx-editor.dev/fonts';
import { describe, expect, it } from 'vitest';

import { bodyOf, read, templateFiles } from './read';

// The in-app editor lays a formula out only in a narrow subset of Word's formulas (no run
// properties, no `m:ctrlPr`, no delimiter, matrix, limit or equation array); any other it prints
// as its letters run together, so 9's N_g read "Ng=p=1nrp·Nspp=1nrp" (tools/import/risk_assessment.py).
const fonts = packagedFonts({
  allow: ['Arial'],
  fetcher: createPackagedFileFetch({
    trustedRoot: new URL('./', FONT_ASSET_ROOT),
    maxBytes: HARD_MAX_FONT_BYTES,
  }),
});

const withFormulas = templateFiles.filter((name) => bodyOf(name).includes('<m:oMath'));

interface Geometry {
  kind: string;
  [part: string]: unknown;
}

function kinds(geometry: Geometry): string[] {
  const nested = Object.values(geometry).flatMap((value) =>
    Array.isArray(value)
      ? value.flatMap((item) => (item && typeof item === 'object' ? kinds(item as Geometry) : []))
      : value && typeof value === 'object' && 'kind' in value
        ? kinds(value as Geometry)
        : []
  );
  return [geometry.kind, ...nested];
}

describe('formulas', () => {
  it('9 is the one template of the set with formulas', () => {
    expect(withFormulas).toEqual(['9.1_risk_assessment.docx']);
  });

  it.each(withFormulas)(
    '%s: the in-app editor lays every formula out, none as plain letters',
    async (name) => {
      const opened = await openFontBackedDocumentForExport(read(name), {
        fonts,
        displayMode: 'proposed',
      });
      if (!opened.ok) throw new Error(`The editor rejected the file: ${opened.reason}`);
      try {
        const layout = await opened.session.layout();
        const equations: Geometry[] = [];
        const visit = (blocks: readonly unknown[]) => {
          for (const block of blocks as {
            kind: string;
            lines?: { spans: { equation?: { geometry: Geometry } }[] }[];
            rows?: { cells: { blocks: unknown[] }[] }[];
          }[]) {
            for (const line of block.lines ?? [])
              for (const span of line.spans)
                if (span.equation) equations.push(span.equation.geometry);
            for (const row of block.rows ?? []) for (const cell of row.cells) visit(cell.blocks);
          }
        };
        for (const page of layout.pages) visit(page.fragments);
        expect(equations).toHaveLength(bodyOf(name).match(/<m:oMath>/g)!.length);
        expect(equations.flatMap(kinds).filter((kind) => kind === 'fallback')).toEqual([]);
      } finally {
        opened.session.dispose();
      }
    },
    60_000
  );
});

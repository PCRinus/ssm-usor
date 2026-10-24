import { describe, expect, it } from 'vitest';

import { parseArticle } from './lib/articles';
import { idsInHtml, leakedMetadata, missingAnchors } from './lib/build';

describe('missingAnchors', () => {
  const topics = { 'a.b': { path: '/a/', anchor: 'deschide-ajutorul-din-aplicație' } };

  it('accepts a page that has the anchor', () => {
    expect(
      missingAnchors(topics, () => '<h2 id="deschide-ajutorul-din-aplica&#x21b;ie">Titlu</h2>')
    ).toEqual([]);
  });

  it('names a topic whose page or anchor is missing', () => {
    expect(missingAnchors(topics, () => '<h2 id="altceva">Titlu</h2>')).toEqual([
      'Topic "a.b": the page /a/ has no heading with the id "deschide-ajutorul-din-aplicație".',
    ]);
    expect(missingAnchors(topics, () => undefined)).toEqual([
      'Topic "a.b": the built site has no page at /a/.',
    ]);
  });
});

describe('idsInHtml', () => {
  it('reads every id attribute', () => {
    expect(idsInHtml('<div id="_top"><h2 id="cnp-ul">CNP-ul</h2></div>')).toEqual(
      new Set(['_top', 'cnp-ul'])
    );
  });
});

describe('leakedMetadata', () => {
  const page = parseArticle(
    'a/b.md',
    '---\ntitle: T\ntopics:\n  - id: angajati.cnp\n    heading: CNP\nsources:\n  - packages/contracts/src/employees.ts\n---\n\n## CNP\n'
  );

  it('accepts a site that shows the heading but not the front matter', () => {
    expect(
      leakedMetadata([page], [{ name: 'a/index.html', text: '<h2 id="cnp">CNP</h2>' }])
    ).toEqual([]);
  });

  it('names a built file that shows a topic id or a source', () => {
    expect(
      leakedMetadata(
        [page],
        [
          { name: 'a/index.html', text: '<meta content="angajati.cnp">' },
          { name: 'pagefind/fragment/ro.pf_fragment', text: 'packages/contracts/src/employees.ts' },
        ]
      )
    ).toEqual([
      'a/index.html shows "angajati.cnp" from the front matter of a/b.md.',
      'pagefind/fragment/ro.pf_fragment shows "packages/contracts/src/employees.ts" from the front matter of a/b.md.',
    ]);
  });
});

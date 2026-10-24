import { describe, expect, it } from 'vitest';

import {
  type Article,
  ArticleError,
  collectTopics,
  headingsOf,
  parseArticle,
  renderTopicsModule,
} from './lib/articles';

function article(file: string, frontMatter: string, body: string): Article {
  return parseArticle(file, `---\ntitle: Titlu\n${frontMatter}---\n\n${body}`);
}

function problemsOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ArticleError) return error.problems;
    throw error;
  }
  return [];
}

describe('headingsOf', () => {
  it('gives each heading the anchor Astro gives it, diacritics and repeats included', () => {
    expect(
      headingsOf('## CNP-ul\n\ntext\n\n### Durata instruirii periodice\n\n## CNP-ul\n')
    ).toEqual([
      { text: 'CNP-ul', anchor: 'cnp-ul' },
      { text: 'Durata instruirii periodice', anchor: 'durata-instruirii-periodice' },
      { text: 'CNP-ul', anchor: 'cnp-ul-1' },
    ]);
    expect(headingsOf('## Deschide ajutorul din aplicație')[0]?.anchor).toBe(
      'deschide-ajutorul-din-aplicație'
    );
  });

  it('reads a heading as its text, without the Markdown around it', () => {
    expect(headingsOf('## Câmpul **CNP** și [legea](/legislatie/) `L 319/2006`')).toEqual([
      { text: 'Câmpul CNP și legea L 319/2006', anchor: 'câmpul-cnp-și-legea-l-3192006' },
    ]);
  });

  it('skips lines inside code blocks', () => {
    expect(headingsOf('```md\n## Nu e titlu\n```\n\n## Titlu')).toEqual([
      { text: 'Titlu', anchor: 'titlu' },
    ]);
  });
});

describe('parseArticle', () => {
  it('derives the page address from the file', () => {
    expect(article('clienti/angajati/index.md', '', '').path).toBe('/clienti/angajati/');
    expect(article('primii-pasi/cont.md', '', '').path).toBe('/primii-pasi/cont/');
  });

  it('rejects topics without an id or a heading and sources that are not paths', () => {
    expect(
      problemsOf(() => article('a/b.md', 'topics:\n  - id: a.b\nsources:\n  - 3\n', '## Titlu'))
    ).toEqual([
      'a/b.md: every topic needs an `id` and a `heading`.',
      'a/b.md: every source must be a path or a glob.',
    ]);
  });
});

describe('collectTopics', () => {
  it('maps each id to its page and anchor, sorted by id', () => {
    const angajati = article(
      'clienti/angajati/index.md',
      'topics:\n  - id: angajati.cnp\n    heading: CNP-ul\n  - id: angajati.adaugare\n    heading: Adaugă un angajat\n',
      '## Adaugă un angajat\n\n## CNP-ul\n'
    );
    expect(collectTopics([angajati])).toEqual({
      'angajati.adaugare': { path: '/clienti/angajati/', anchor: 'adaugă-un-angajat' },
      'angajati.cnp': { path: '/clienti/angajati/', anchor: 'cnp-ul' },
    });
  });

  it('fails on a heading the article does not have', () => {
    const page = article('a/b.md', 'topics:\n  - id: a.b\n    heading: CNP\n', '## CNP-ul\n');
    expect(problemsOf(() => collectTopics([page]))).toEqual([
      'a/b.md: topic "a.b" names the heading "CNP", which the article does not have.',
    ]);
  });

  it('fails on an id listed twice, in one article or across two', () => {
    const first = article(
      'a/one.md',
      'topics:\n  - id: a.b\n    heading: Unu\n  - id: a.b\n    heading: Unu\n',
      '## Unu\n'
    );
    const second = article('a/two.md', 'topics:\n  - id: a.b\n    heading: Doi\n', '## Doi\n');
    expect(problemsOf(() => collectTopics([first, second]))).toEqual([
      'a/one.md: topic id "a.b" is already listed by a/one.md.',
      'a/two.md: topic id "a.b" is already listed by a/one.md.',
    ]);
  });

  it.each(['angajati', 'angajati.cnp.vechi', 'Angajati.cnp', 'angajați.cnp', 'angajati.cnp ul'])(
    'fails on the id %j, which is not area.slug',
    (id) => {
      const page = article(
        'a/b.md',
        `topics:\n  - id: ${JSON.stringify(id)}\n    heading: CNP\n`,
        '## CNP\n'
      );
      expect(problemsOf(() => collectTopics([page]))).toEqual([
        `a/b.md: topic id "${id}" does not match area.slug (lowercase letters, digits and hyphens).`,
      ]);
    }
  );

  it('reports every problem at once', () => {
    const page = article(
      'a/b.md',
      'topics:\n  - id: rau\n    heading: CNP\n  - id: a.b\n    heading: Lipsă\n',
      '## CNP\n'
    );
    expect(problemsOf(() => collectTopics([page]))).toHaveLength(2);
  });
});

describe('renderTopicsModule', () => {
  it('writes an empty map when no article lists a topic', () => {
    expect(renderTopicsModule({})).toContain('export const helpTopics = {} as const;');
  });
});

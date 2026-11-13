import PizZip from 'pizzip';
import { describe, expect, it, vi } from 'vitest';

import { candidateParagraphs, stemsOf } from './candidates';
import { branchOf, changeFilter, toOpenChange } from './changes';
import { createGitHub } from './github';

function docx(paragraphs: string[]) {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document><w:body>${paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`
  );
  return zip.generate({ type: 'uint8array' });
}

describe('the paragraphs sent to the model', () => {
  const unit = {
    old: 'Conducătorii motocicletelor și mopedelor poartă casca de protecție omologată.',
    new: 'Conducătorii motocicletelor și mopedelor poartă pe cap cască de protecție omologată pentru această categorie de vehicul.',
  };
  const source = docx([
    'Motocicliștii poartă întotdeauna cască de protecție omologată.',
    'Conducătorii motocicletelor poartă casca de protecție omologată.',
    'Fiecare categorie de vehicul are regulile ei.',
    'Stingătoarele se verifică anual.',
  ]);

  it('are our own sentences that share the rule, never the quote', () => {
    const found = candidateParagraphs(
      'a.docx',
      source,
      [unit],
      [{ file: 'a.docx', paragraph: 1, lastParagraph: 1 }]
    );
    expect(found.map((each) => each.paragraph)).toEqual([0]);
  });

  it('leave out a sentence that shares only the words the change brought', () => {
    const found = candidateParagraphs('a.docx', source, [unit], []);
    expect(found.map((each) => each.paragraph)).not.toContain(2);
  });

  it('read a word by its first letters, without diacritics', () => {
    expect([...stemsOf('Cască, motocicletelor; și')]).toEqual(['casca', 'motoci']);
  });
});

describe('a stored change', () => {
  it('names the amending act the portal listed when the notes named none', () => {
    const change = toOpenChange({
      id: '0fd0fd0f-0000-4000-8000-000000000195',
      act_id: 'oug-195-2002',
      consolidated_on: '2026-11-06',
      compared_with: '2026-08-25',
      amending_act: 'LEGE 207 03/11/2026',
      outcome: 'quote_differs',
      amending_acts: null,
      amended_units: [{ unit: 'Art. 36 alin. (2)' }, { unit: 'Art. 36 alin. (2)' }],
      review: null,
      act: { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portal_id: 41006 },
      passages: [],
    });
    expect(change.amendingActs).toEqual([{ name: 'LEGE 207 03/11/2026', portalId: null }]);
    expect(change.amendedUnits).toEqual(['Art. 36 alin. (2)']);
    expect(branchOf(change)).toBe('legislation/oug-195-2002-2026-11-06');
  });

  it('is chosen by its act, or by its act and form', () => {
    const change = { act: { id: 'oug-195-2002' }, consolidatedOn: '2026-11-06' } as never;
    expect(changeFilter(undefined)(change)).toBe(true);
    expect(changeFilter('oug-195-2002')(change)).toBe(true);
    expect(changeFilter('oug-195-2002-2026-11-06')(change)).toBe(true);
    expect(changeFilter('oug-195-2002:2026-11-06')(change)).toBe(true);
    expect(changeFilter('oug-195-2002-2026-11-07')(change)).toBe(false);
    expect(changeFilter('lege-319-2006')(change)).toBe(false);
  });
});

describe('GitHub', () => {
  it('opens the pull request with the App token, and the issue with the workflow token', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/pulls')) return Response.json({ number: 9, html_url: 'u', state: 'open' });
      if (url.endsWith('/issues'))
        return Response.json({ number: 10, html_url: 'i', state: 'open' });
      return Response.json([]);
    });
    const github = createGitHub({
      repository: 'PCRinus/ssm-usor',
      token: 'workflow',
      appToken: 'app',
      fetcher,
    });
    await github.openPull({ title: 't', branch: 'legislation/x', base: 'main', body: 'b' });
    await github.openIssue({ title: 't', body: 'b' });
    const auth = fetcher.mock.calls.map(([input, init]) => [
      String(input).replace('https://api.github.com/repos/PCRinus/ssm-usor', ''),
      (init?.headers as Record<string, string>).Authorization,
    ]);
    expect(auth).toEqual([
      ['/pulls', 'Bearer app'],
      ['/issues/9/labels', 'Bearer app'],
      ['/issues', 'Bearer workflow'],
    ]);
  });

  it('creates the label only when it is missing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({}));
    await createGitHub({ repository: 'PCRinus/ssm-usor', token: 't', fetcher }).ensureLabel();
    expect(fetcher.mock.calls[1]![1]?.method).toBe('POST');
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({
      name: 'legislation',
    });
  });

  it('finds an issue by its marker and leaves pull requests out', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        { number: 1, html_url: 'p', state: 'open', body: 'marker', pull_request: {} },
        { number: 2, html_url: 'i', state: 'closed', body: 'x marker y' },
      ])
    );
    const github = createGitHub({ repository: 'PCRinus/ssm-usor', token: 't', fetcher });
    await expect(github.issueByMarker('marker')).resolves.toEqual({
      number: 2,
      url: 'i',
      state: 'closed',
    });
  });
});

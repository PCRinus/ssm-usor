import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  type ActUnit,
  fetchActForm,
  fetchActText,
  formOn,
  hasActText,
  parseActText,
  parseConsolidations,
  textLink,
  unitLines,
  unitsOf,
} from './act-text';
import { PortalError, portalUserAgent } from './portal';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const roadCode = fixture('oug-195-2002-text.html');
const criminalCodePage = fixture('lege-286-2009-page.html');
const criminalCode = fixture('codul-penal-text.html');
const normsDecision = fixture('hg-1425-2006-text.html');
const norms = fixture('hg-1425-2006-norms.html');
const signsDecision = fixture('hg-971-2006-text.html');

const article = (html: string, label: string) => {
  const [match] = unitsOf(parseActText(html, 0), 'article', label);
  return match!.unit;
};
const labels = (unit: ActUnit) =>
  unit.content.flatMap((item) => (typeof item === 'string' ? [] : [`${item.kind} ${item.label}`]));

describe('reading the consolidated text of an act', () => {
  it('reads the articles and their alineate, not the table of contents', () => {
    const text = parseActText(roadCode, 41006);
    expect(text.title).toMatch(/^ORDONANȚĂ DE URGENȚĂ nr\. 195 din 12 decembrie 2002/);
    expect(unitsOf(text, 'article', '36')).toHaveLength(1);
    expect(labels(article(roadCode, '36'))).toEqual([
      'alineat 1',
      'alineat 1^1',
      'alineat 1^2',
      'alineat 1^3',
      'alineat 2',
      'alineat 3',
    ]);
  });

  it('leaves the amendment notes out of the text', () => {
    expect(unitLines(article(roadCode, '36'))[4]).toBe(
      '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.'
    );
  });

  it('reads a note of the dated style with the unit it sits on', () => {
    const note = parseActText(roadCode, 41006).notes.find(
      (candidate) => candidate.path.article === '36' && candidate.path.alineat === '2'
    );
    expect(note).toMatchObject({
      date: '2026-11-06',
      dated: 'in_force',
      path: { annex: null, article: '36', alineat: '2', letter: null, point: null },
      named: { article: '36', alineat: '2' },
      subject: 'Alineatul (2), Articolul 36, Sectiunea 1, Capitolul V',
      operation: 'modified',
      provision: 'Punctul 2., Articolul I',
      amendingAct: {
        kind: 'LEGEA',
        number: '207',
        date: '2026-11-03',
        name: 'Legea 207/2026',
        portalId: 316007,
        gazette: { number: '922', date: '2026-11-03' },
      },
    });
  });

  it('reads a note of the older style, which names the unit after the provision', () => {
    const note = parseActText(roadCode, 41006).notes.find(
      (candidate) => candidate.path.article === '36' && candidate.path.alineat === '1'
    );
    expect(note).toMatchObject({
      date: '2014-09-01',
      named: { article: '36', alineat: '1' },
      subject: 'Alin. (1) al art. 36',
      operation: 'modified',
      provision: 'lit. d) a pct. 35 al art. I',
      amendingAct: {
        kind: 'ORDONANȚA',
        name: 'O.G. 21/2014',
        date: '2014-08-26',
        gazette: { number: '635', date: '2014-08-29' },
      },
    });
    const inserted = parseActText(roadCode, 41006).notes.find(
      (candidate) => candidate.path.alineat === '1^1'
    );
    expect(inserted?.operation).toBe('inserted');
  });

  it('reads a note without a date, dated by its gazette, and drops the line before it', () => {
    const text = parseActText(signsDecision, 74127);
    expect(unitLines(article(signsDecision, '2'))).toEqual([
      'Prezenta hotărâre nu se aplică semnalizării pentru introducerea pe piaţă a substanţelor şi amestecurilor periculoase, a produselor şi/sau a echipamentelor, cu excepţia cazului în care alte dispoziţii legale fac referire în mod expres la aceasta.',
    ]);
    expect(text.notes[0]).toMatchObject({
      date: '2015-05-28',
      dated: 'published',
      path: { article: '2' },
      subject: 'Art. 2',
      amendingAct: { name: 'H.G. 359/2015', date: '2015-05-20' },
    });
  });

  it('takes a label written at the start of the body, and an alineat marked as a letter', () => {
    expect(labels(article(signsDecision, '6'))).toEqual(['alineat 1', 'alineat 2']);
    expect(unitLines(article(signsDecision, '6'))[1]).toMatch(/^\(2\) Pentru alegerea/);
  });

  it("leaves out the editor's notes and footnotes", () => {
    const html = roadCode.replace(
      'baston de culoare alba.',
      'baston de culoare alba.<span class="S_PAR">*) A se vedea Ordinul nr. 1/2020.</span>' +
        '<span class="S_NTA"><span class="S_NTA_TTL">Notă</span><span>Conform art. III …</span></span>'
    );
    expect(unitLines(article(html, '35')).at(-1)).toBe(
      '(7) Nevăzătorii sunt obligați să poarte în deplasarea pe drumurile publice baston de culoare alba.'
    );
  });

  it('tells a page without the text and finds where the text is', () => {
    expect(hasActText(criminalCodePage)).toBe(false);
    expect(textLink(criminalCodePage)).toBe(314314);
    expect(hasActText(roadCode)).toBe(true);
  });
});

describe('fetching the consolidated text of an act', () => {
  const respond = (pages: Record<string, string>) =>
    vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      return pages[path] === undefined
        ? new Response('', { status: 302 })
        : new Response(pages[path], { status: 200 });
    });

  it('reads the text on the act page', async () => {
    const fetchMock = respond({ '/Public/DetaliiDocument/41006': roadCode });
    const fetched = await fetchActText(41006, { fetch: fetchMock, pauseMs: 0 });
    expect(fetched).toMatchObject({
      source: 'page',
      url: 'https://legislatie.just.ro/Public/DetaliiDocument/41006',
      annexUrls: [],
      consolidatedOn: '2026-11-06',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('User-Agent')).toBe(
      portalUserAgent
    );
  });

  it('follows the link of a page too large to hold its text', async () => {
    const fetchMock = respond({
      '/Public/DetaliiDocument/109854': criminalCodePage,
      '/Public/DetaliiDocumentAfis/314314': criminalCode,
    });
    const fetched = await fetchActText(109854, { fetch: fetchMock, pauseMs: 0 });
    expect(fetched).toMatchObject({
      source: 'afis',
      url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/314314',
      consolidatedOn: '2026-10-18',
    });
    expect(unitLines(unitsOf(fetched.text, 'article', '349')[0]!.unit)[0]).toBe(
      'Neluarea măsurilor legale de securitate și sănătate în muncă'
    );
  });

  it('reads an annex the portal keeps as a document of its own into the annex', async () => {
    const fetchMock = respond({
      '/Public/DetaliiDocument/76337': normsDecision,
      '/Public/DetaliiDocumentAfis/252029': norms,
    });
    const fetched = await fetchActText(76337, { fetch: fetchMock, pauseMs: 0 });
    expect(fetched.annexUrls).toEqual([
      'https://legislatie.just.ro/Public/DetaliiDocumentAfis/252029',
    ]);
    const [match] = unitsOf(fetched.text, 'article', '98');
    expect(match?.annex).toBe('Anexă');
    expect(match?.ancestors[0]?.heading).toMatch(/^NORME METODOLOGICE/);
  });

  it('goes through a relay with its headers', async () => {
    const fetchMock = respond({
      '/Public/DetaliiDocument/109854': criminalCodePage,
      '/Public/DetaliiDocumentAfis/314314': criminalCode,
    });
    await fetchActText(109854, {
      fetch: fetchMock,
      pauseMs: 0,
      origin: 'https://relay.example.com',
      headers: { 'CF-Access-Client-Id': 'id.access' },
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://relay.example.com/Public/DetaliiDocument/109854',
      'https://relay.example.com/Public/DetaliiDocumentAfis/314314',
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('CF-Access-Client-Id')).toBe('id.access');
    }
  });

  it('lists the forms of an act, newest first, the page read having no link', () => {
    const forms = parseConsolidations(roadCode);
    expect(forms).toEqual([
      { date: '2026-11-06', kind: 'consolidation', path: null },
      { date: '2026-08-25', kind: 'consolidation', path: '/Public/DetaliiDocument/312713' },
    ]);
    expect(formOn(forms, '2026-10-01')?.date).toBe('2026-08-25');
    expect(formOn(forms, '2026-11-06')?.date).toBe('2026-11-06');
    expect(formOn(forms, '2026-01-01')).toBeNull();
  });

  it('counts a republication among the forms, its link with its query', () => {
    const page =
      "<a title='Republicarea din 06.04.2022' style='color:red'>Republicarea 1</a>" +
      "<a title='Consolidarea din 11.01.2022' href='~/../../../Public/DetaliiDocument/249634'>11.01.2022</a>" +
      "<a title='Republicarea din 20.09.2006' href='~/../../../Public/DetaliiDocument/74028?isFormaDeBaza=True'>Republicarea</a>";
    expect(parseConsolidations(page)).toEqual([
      { date: '2022-04-06', kind: 'republication', path: null },
      { date: '2022-01-11', kind: 'consolidation', path: '/Public/DetaliiDocument/249634' },
      {
        date: '2006-09-20',
        kind: 'republication',
        path: '/Public/DetaliiDocument/74028?isFormaDeBaza=True',
      },
    ]);
  });

  it('reads the form in force on a date from its own page', async () => {
    const fetchMock = respond({
      '/Public/DetaliiDocument/41006': roadCode,
      '/Public/DetaliiDocument/312713': fixture('oug-195-2002-2026-08-25.html'),
    });
    const fetched = await fetchActForm(41006, '2026-10-01', { fetch: fetchMock, pauseMs: 0 });
    expect(fetched).toMatchObject({
      portalId: 41006,
      formPortalId: 312713,
      consolidatedOn: '2026-08-25',
      source: 'page',
    });
    expect(unitLines(unitsOf(fetched.text, 'article', '36')[0]!.unit)[4]).toMatch(
      /să poarte casca de protecție omologată\.$/
    );
  });

  it("follows an earlier form's link to its text, as for the newest", async () => {
    const fetchMock = respond({
      '/Public/DetaliiDocument/109854': criminalCodePage,
      '/Public/DetaliiDocument/311786': fixture('lege-286-2009-2026-07-23.html'),
      '/Public/DetaliiDocumentAfis/311787': fixture('codul-penal-2026-07-23.html'),
    });
    const fetched = await fetchActForm(109854, '2026-08-01', { fetch: fetchMock, pauseMs: 0 });
    expect(fetched).toMatchObject({
      formPortalId: 311786,
      consolidatedOn: '2026-07-23',
      source: 'afis',
      url: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/311787',
    });
  });

  it('fails for a date before every consolidated form', async () => {
    const fetchMock = respond({ '/Public/DetaliiDocument/41006': roadCode });
    await expect(
      fetchActForm(41006, '2020-01-01', { fetch: fetchMock, pauseMs: 0 })
    ).rejects.toThrow(/no consolidated form on or before 2020-01-01/);
  });

  it('fails on a page with neither the text nor a link to it', async () => {
    const page = criminalCodePage.replaceAll('DetaliiDocumentAfis', 'Elsewhere');
    const fetchMock = respond({ '/Public/DetaliiDocument/109854': page });
    await expect(fetchActText(109854, { fetch: fetchMock, pauseMs: 0 })).rejects.toThrow(
      PortalError
    );
  });
});

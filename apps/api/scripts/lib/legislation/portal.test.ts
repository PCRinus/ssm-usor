import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  describeAct,
  fetchPortalAct,
  parseActions,
  parseActPage,
  PortalError,
  portalUserAgent,
} from './portal';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/legislation/${name}`, import.meta.url), 'utf8');

const lawPage = fixture('lege-319-2006.html');
const lawActions = JSON.parse(fixture('lege-319-2006-actions.json')) as unknown;
const repealedActions = JSON.parse(fixture('lege-90-1996-actions.json')) as unknown;

describe('reading an act page of the Portal Legislativ', () => {
  it('reads the title and the consolidations of Legea 319/2006', () => {
    expect(parseActPage(lawPage, 73772)).toEqual({
      title: 'LEGE nr. 319 din 14 iulie 2006 a securității și sănătății în muncă',
      consolidations: [
        '2021-07-25',
        '2021-05-06',
        '2018-07-28',
        '2017-07-19',
        '2014-02-01',
        '2012-03-24',
      ],
    });
  });

  it('reads every consolidation of H.G. 1425/2006, newest first', () => {
    const page = parseActPage(fixture('hg-1425-2006.html'), 76337);
    expect(page.title).toMatch(/^HOTĂRÂRE nr\. 1\.425 din 11 octombrie 2006 pentru aprobarea/);
    expect(page.consolidations).toEqual(['2022-03-07', '2016-10-21', '2011-12-27', '2010-09-27']);
  });

  it('fails on a page without the "Forme act" section', () => {
    expect(() => parseActPage('<html><body>Mentenanță</body></html>', 73772)).toThrow(PortalError);
  });

  it('fails on a page whose heading is missing', () => {
    expect(() => parseActPage(lawPage.replaceAll('S_DEN', 'S_XYZ'), 73772)).toThrow(/heading/);
  });

  it('fails when a consolidated form is offered without its dates', () => {
    expect(() =>
      parseActPage(lawPage.replaceAll('Consolidarea din', 'Consolidare la'), 73772)
    ).toThrow(/no consolidation dates/);
  });

  it('fails on a consolidation date that does not exist', () => {
    expect(() =>
      parseActPage(
        lawPage.replace(
          "title='Consolidarea din 25.07.2021'",
          "title='Consolidarea din 31.02.2021'"
        ),
        73772
      )
    ).toThrow(/impossible date/);
  });
});

describe('reading the actions an act underwent', () => {
  it('reads the operations and the acts behind them', () => {
    const actions = parseActions(lawActions, 73772);
    expect(actions).toHaveLength(11);
    expect(actions).toContainEqual({
      section: 'ART. 21',
      operation: 'MODIFICAT DE',
      act: 'LEGE 208 21/07/2021',
      actPortalId: 244843,
      actDate: '2021-07-21',
    });
  });

  it('reads an act that underwent nothing as an empty list', () => {
    expect(
      parseActions(
        { acte: '<table><tr><td> Nu exista actiuni suferite de acest act</td></tr></table>' },
        1
      )
    ).toEqual([]);
  });

  it('fails on an answer it does not recognize', () => {
    expect(() => parseActions({ error: 'x' }, 1)).toThrow(PortalError);
    expect(() => parseActions({ acte: '<p>Eroare</p>' }, 1)).toThrow(/TIP OPERATIUNE/);
    expect(() =>
      parseActions({ acte: '<table><tr><td>TIP OPERATIUNE</td></tr></table>' }, 1)
    ).toThrow(/no rows/);
  });
});

describe('describing an act', () => {
  it('names the act behind the newest consolidation of Legea 319/2006', () => {
    expect(
      describeAct(73772, parseActPage(lawPage, 73772), parseActions(lawActions, 73772))
    ).toEqual({
      portalId: 73772,
      title: 'LEGE nr. 319 din 14 iulie 2006 a securității și sănătății în muncă',
      status: 'in_force',
      consolidations: [
        '2021-07-25',
        '2021-05-06',
        '2018-07-28',
        '2017-07-19',
        '2014-02-01',
        '2012-03-24',
      ],
      newestConsolidation: '2021-07-25',
      amendingActs: ['LEGE 208 21/07/2021'],
    });
  });

  it('marks an act repealed as a whole', () => {
    const act = describeAct(
      26455,
      { title: 'LEGE nr. 90 din 12 iulie 1996', consolidations: ['2005-07-11', '2002-03-26'] },
      parseActions(repealedActions, 26455)
    );
    expect(act.status).toBe('repealed');
    expect(act.amendingActs).toEqual(['LEGE 194 23/06/2005']);
  });

  it('has no newest consolidation for an act never consolidated', () => {
    const act = describeAct(1, { title: 'ORDIN nr. 1', consolidations: [] }, []);
    expect(act).toMatchObject({ newestConsolidation: null, amendingActs: [], status: 'in_force' });
  });
});

describe('fetching an act from the portal', () => {
  it('reads the page, then the actions, as the project', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(lawPage, { status: 200 }))
      .mockResolvedValueOnce(Response.json(lawActions));
    const act = await fetchPortalAct(73772, { fetch: fetchMock, pauseMs: 0 });
    expect(act.newestConsolidation).toBe('2021-07-25');

    const [pageUrl, pageInit] = fetchMock.mock.calls[0]!;
    expect(pageUrl).toBe('https://legislatie.just.ro/Public/DetaliiDocument/73772');
    expect(new Headers(pageInit?.headers).get('User-Agent')).toBe(portalUserAgent);
    const [actionsUrl, actionsInit] = fetchMock.mock.calls[1]!;
    expect(actionsUrl).toBe('https://legislatie.just.ro/Public/actiuniSuferite');
    expect(actionsInit?.method).toBe('POST');
    expect(actionsInit?.body).toBe('contor=73772');
  });

  it('fails on the redirect the portal answers a missing page with', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/Error' } }));
    await expect(fetchPortalAct(1, { fetch: fetchMock, pauseMs: 0 })).rejects.toThrow(
      /answered 302/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails when the portal cannot be reached', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(fetchPortalAct(1, { fetch: fetchMock, pauseMs: 0 })).rejects.toThrow(
      /could not be fetched: fetch failed/
    );
  });

  it('fails when the actions are not JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(lawPage, { status: 200 }))
      .mockResolvedValueOnce(new Response('<html>Eroare</html>', { status: 200 }));
    await expect(fetchPortalAct(73772, { fetch: fetchMock, pauseMs: 0 })).rejects.toThrow(
      /not JSON/
    );
  });
});

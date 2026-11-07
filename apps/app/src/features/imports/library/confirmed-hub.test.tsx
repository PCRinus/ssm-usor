import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { clientId, fetchMock, importDetail, importId, mockApi } from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const legalName = 'Royal Hotel SRL';
const confirmedAt = '2026-11-05T10:00:00+00:00';
const expiresAt = '2026-11-19T10:00:00.000Z';

type Fields = Record<string, unknown>;

const partFields: Fields = {
  status: 'to_review',
  attempt: 1,
  failureReason: null,
  version: 0,
  counts: null,
  readAt: '2026-11-04T10:00:00+00:00',
  confirmedAt: null,
  expiresAt,
  credits: 25,
  changes: null,
  proposal: null,
};

const ssm = (fields: Fields = {}) => ({
  ...partFields,
  part: 'instructions_ssm',
  domain: 'ssm',
  positionPosts: {},
  ...fields,
});
const su = (fields: Fields = {}) => ({
  ...partFields,
  part: 'instructions_su',
  domain: 'su',
  positionPosts: {},
  ...fields,
});
const risks = (fields: Fields = {}) => ({
  ...partFields,
  part: 'risk_evaluations',
  postReferences: {},
  existingFactors: null,
  ...fields,
});

const confirmedPart = { status: 'confirmed', confirmedAt: '2026-11-07T09:00:00+00:00' };

function mockHub(parts: Fields[]) {
  const detail = importDetail({
    status: 'confirmed',
    confirmedAt,
    client: { id: clientId, legalName },
    companyName: legalName,
    libraryParts: parts.map(({ part, status }) => ({ part, status, expiresAt })),
  });
  mockApi((init, url) => {
    if (url.pathname === `/imports/${importId}`) return Response.json({ import: detail });
    if (url.pathname === `/imports/${importId}/library-parts`) {
      return Response.json({ parts, posts: [] });
    }
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === '/clients') {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    return undefined;
  });
}

const mount = () => mountApp(authFixture(makeSession()).client, `/clienti/import/${importId}`);

const partsOf = (testId: string) =>
  screen.queryAllByTestId(testId).map((row) => row.getAttribute('data-part'));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
});

afterEach(() => {
  disposeRuntimes();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a confirmed client import with parts still open', () => {
  it('leads with what is left, by when, each with its page, and lists what is done below', async () => {
    mockHub([
      ssm({ counts: { identical: 5, similar: 1, new: 3, unread: 0 } }),
      su(confirmedPart),
      risks({ counts: { identical: 2, similar: 0, new: 2, unread: 0 } }),
    ]);
    mount();

    const panel = await screen.findByTestId('import-next-steps');
    expect(within(panel).getByRole('heading', { name: 'Ce mai ai de făcut' })).toBeDefined();
    expect(within(panel).getByTestId('import-next-steps-deadline').textContent).toBe(
      'Până pe 19 noiembrie · mai ai 14 zile'
    );
    expect(panel.textContent).toContain(
      'Am găsit în pachet instrucțiuni și evaluări de risc pe care nu le ai.'
    );
    expect(partsOf('import-next-step')).toEqual(['instructions_ssm', 'risk_evaluations']);
    const [ipssm, sheets] = within(panel).getAllByTestId('import-next-step-open');
    expect(ipssm!.textContent).toBe('Verifică IPSSM');
    expect(ipssm!.getAttribute('href')).toBe(`/clienti/import/${importId}/instructiuni/ssm`);
    expect(ipssm!.getAttribute('data-variant')).toBe('default');
    expect(sheets!.textContent).toBe('Verifică evaluările');
    expect(sheets!.getAttribute('href')).toBe(`/clienti/import/${importId}/evaluari-de-risc`);
    expect(sheets!.getAttribute('data-variant')).toBe('outline');
    expect(within(panel).getAllByTestId('import-next-step-description')[0]!.textContent).toBe(
      'De verificat: 3 noi și una asemănătoare. 5 deja în bibliotecă.'
    );
    expect(panel.querySelector('[data-help-topic="import.instructiuni-proprii"]')).not.toBeNull();
    expect(panel.querySelector('[data-help-topic="import.evaluari-de-risc"]')).not.toBeNull();

    expect(screen.getByRole('heading', { name: 'Gata' })).toBeDefined();
    expect(screen.getByTestId('import-done-client').textContent).toContain(
      `Preluate în ${legalName} pe 5 noiembrie.`
    );
    expect(screen.getByTestId('import-open-client').getAttribute('href')).toBe(
      `/clienti/${clientId}/detalii`
    );
    expect(partsOf('import-done-part')).toEqual(['instructions_su']);
    const done = screen.getByTestId('import-done-part');
    expect(done.textContent).toContain('Confirmate pe 7 noiembrie.');
    expect(within(done).getByTestId('import-done-part-open').getAttribute('href')).toBe(
      `/clienti/import/${importId}/instructiuni/su`
    );
    expect(screen.queryByTestId('import-finished')).toBeNull();
    expect(screen.queryByTestId('import-confirmed')).toBeNull();
  });

  it('keeps the status of a part still read or failed, with its page', async () => {
    mockHub([
      ssm({ status: 'reading', readAt: null }),
      risks({ status: 'failed', failureReason: 'Citirea s-a oprit înainte de final.' }),
    ]);
    mount();

    const panel = await screen.findByTestId('import-next-steps');
    expect(
      within(panel)
        .getAllByTestId('library-part-status')
        .map((tag) => tag.textContent)
    ).toEqual(['Se citește', 'Nu s-a putut citi']);
    expect(
      within(panel)
        .getAllByTestId('import-next-step-description')
        .map((line) => line.textContent)
    ).toEqual([
      'Le citim din pachet. Nu te țin pe loc: verifici clientul între timp.',
      'Citirea s-a oprit înainte de final.',
    ]);
    expect(
      within(panel)
        .getAllByTestId('import-next-step-open')
        .map((link) => link.textContent)
    ).toEqual(['Vezi IPSSM', 'Vezi evaluările']);
    expect(panel.textContent).not.toContain('Am găsit în pachet');
  });

  it('says the last day has come', async () => {
    vi.setSystemTime(new Date('2026-11-19T08:00:00.000Z'));
    mockHub([ssm({ counts: { identical: 0, similar: 0, new: 1, unread: 0 } })]);
    mount();

    expect((await screen.findByTestId('import-next-steps-deadline')).textContent).toBe(
      'Până pe 19 noiembrie · expiră azi'
    );
  });
});

describe('a confirmed client import with nothing left open', () => {
  it('says the import is over, offers the client and lists what it took', async () => {
    mockHub([ssm(confirmedPart), su(confirmedPart), risks(confirmedPart)]);
    mount();

    const finished = await screen.findByTestId('import-finished');
    expect(within(finished).getByRole('heading', { name: 'Importul e încheiat.' })).toBeDefined();
    expect(finished.textContent).toContain(
      'Datele clientului, instrucțiunile și evaluările de risc sunt preluate. Poți genera documentația clientului.'
    );
    expect(within(finished).getByTestId('import-open-client').getAttribute('data-variant')).toBe(
      'default'
    );
    expect(screen.getByRole('heading', { name: 'Ce am preluat' })).toBeDefined();
    expect(screen.getAllByTestId('import-open-client')).toHaveLength(1);
    expect(partsOf('import-done-part')).toEqual([
      'instructions_ssm',
      'instructions_su',
      'risk_evaluations',
    ]);
    expect(screen.queryByTestId('import-next-steps')).toBeNull();
    expect(screen.queryByTestId('import-expired')).toBeNull();
  });

  it('lists the parts that expired apart, with why', async () => {
    vi.setSystemTime(new Date('2026-11-20T12:00:00.000Z'));
    mockHub([ssm(), su(confirmedPart), risks({ status: 'nothing_new' })]);
    mount();

    const finished = await screen.findByTestId('import-finished');
    expect(finished.textContent).toContain(
      'Datele clientului și instrucțiunile sunt preluate. Poți genera documentația clientului.'
    );
    expect(screen.getByRole('heading', { name: 'Au expirat' })).toBeDefined();
    expect(partsOf('import-expired-part')).toEqual(['instructions_ssm', 'risk_evaluations']);
    expect(screen.getAllByTestId('import-expired-part')[0]!.textContent).toContain(
      'A expirat pe 19 noiembrie, la 14 zile după crearea clientului.'
    );
    expect(partsOf('import-done-part')).toEqual(['instructions_su']);
  });
});

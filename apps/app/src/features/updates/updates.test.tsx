import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Release } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { readDismissedTag, saveDismissedTag } from './dismissal';
import {
  dialogHighlights,
  fixCount,
  formatReleaseMonth,
  formatReleaseWeekday,
  improvementCount,
  newCount,
  tagCalendar,
} from './release-format';

const feature = (title: string, icon: string | null = 'clipboard-check') => ({
  title,
  text: `${title}, pe larg.`,
  where: 'Client, fila Instruiri',
  icon,
});

const newest: Release = {
  tag: '2026.11.06',
  publishedAt: '2026-11-06T08:00:00.000Z',
  headline: 'Teste de verificare, direct din portal',
  lead: 'Dai un test angajaților unui client, ei răspund de pe telefon.',
  features: [
    feature('Teste compuse din banca de întrebări'),
    feature('Răspunsuri de pe telefon', 'smartphone'),
    feature('Rezultatul ajunge în fișa individuală', 'no-such-icon'),
  ],
  improvements: ['Lista de angajați arată cine e la zi.', 'Telefonul se verifică pe loc.'],
  fixes: ['Data de pe PDF nu mai iese cu o zi în urmă.'],
  unread: true,
};

const reminders: Release = {
  tag: '2026.10.30',
  publishedAt: '2026-10-30T09:00:00.000Z',
  headline: 'Reamintiri pentru semnăturile restante',
  lead: 'Participanții care n-au semnat primesc o reamintire.',
  features: [feature('Reamintiri automate', 'bell')],
  improvements: ['Lista de semnături se sortează după dată.'],
  fixes: [],
  unread: true,
};

const fixesOnly: Release = {
  tag: '2026.10.28',
  publishedAt: '2026-10-28T09:00:00.000Z',
  headline: 'Arhiva documentelor include din nou anexele IPSSM',
  lead: null,
  features: [],
  improvements: [],
  fixes: ['Arhiva conține anexele.', 'Numele fișierelor păstrează diacriticele.'],
  unread: false,
};

const first: Release = {
  tag: '2026.10.23',
  publishedAt: '2026-10-23T09:00:00.000Z',
  headline: 'Prima versiune publică',
  lead: 'SSM Ușor se deschide pentru primii clienți.',
  features: [feature('Documentația SSM și PSI')],
  improvements: [],
  fixes: [],
  unread: false,
};

const fetchMock = vi.fn<typeof fetch>();

function mockApi(initial: Release[]) {
  let releases = initial;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role: 'specialist',
        },
      });
    }
    if (pathname === '/releases' && method === 'GET') return Response.json({ items: releases });
    if (pathname === '/releases/acknowledge' && method === 'POST') {
      const { tag } = JSON.parse(String(init?.body)) as { tag: string };
      releases = releases.map((release) => ({ ...release, unread: false }));
      return Response.json({ acknowledgedThrough: tag });
    }
    return Response.json({ error: { code: 'not_found', message: 'Not here.' } }, { status: 404 });
  });
}

const acknowledgements = () =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname === '/releases/acknowledge' && init?.method === 'POST'
    )
    .map(([, init]) => JSON.parse(String(init?.body)) as { tag: string });

const mount = (path = '/dashboard') => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('formatting', () => {
  it('reads the calendar from the tag and names the day in Bucharest', () => {
    expect(tagCalendar('2026.11.06.2')).toEqual({ year: '2026', month: 11 });
    expect(formatReleaseWeekday('2026-11-05T23:30:00.000Z')).toBe('vineri, 6 noiembrie');
    expect(formatReleaseMonth('2026-11-06T08:00:00.000Z')).toBe('Noiembrie 2026');
  });

  it('counts in Romanian', () => {
    expect(newCount(1)).toBe('1 nouă');
    expect(newCount(3)).toBe('3 noi');
    expect(improvementCount(1)).toBe('1 îmbunătățire');
    expect(improvementCount(4)).toBe('4 îmbunătățiri');
    expect(fixCount(1)).toBe('1 remediere');
    expect(fixCount(20)).toBe('20 de remedieri');
  });

  it('counts what the dialog leaves out, and shows plain lines when there are no features', () => {
    expect(dialogHighlights(newest).more).toBe(3);
    expect(dialogHighlights({ ...newest, improvements: [], fixes: [] }).more).toBe(0);
    expect(
      dialogHighlights({ ...newest, features: [...newest.features, feature('A patra')], fixes: [] })
        .more
    ).toBe(3);
    const lines = dialogHighlights(fixesOnly);
    expect(lines.features).toEqual([]);
    expect(lines.lines).toEqual(fixesOnly.fixes);
    expect(lines.more).toBe(0);
  });

  it('survives a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readDismissedTag()).toBeNull();
    expect(() => saveDismissedTag('2026.11.06')).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe('the update dialog', () => {
  it('opens on the newest unread release with its highlights and the count of the rest', async () => {
    mockApi([newest, reminders, fixesOnly, first]);
    mount();
    const dialog = await screen.findByRole('dialog', { name: newest.headline });
    expect(within(dialog).getByText(newest.lead!)).toBeTruthy();
    const rows = within(within(dialog).getByTestId('update-dialog-highlights')).getAllByRole(
      'listitem'
    );
    expect(rows.map((row) => row.textContent)).toEqual(
      newest.features.map((item) => `${item.title}${item.text}`)
    );
    expect(within(dialog).getByTestId('update-dialog-more').textContent).toBe(
      'și încă 3 îmbunătățiri'
    );
    expect(within(dialog).getByText('publicată pe 6 noiembrie 2026')).toBeTruthy();
    expect(screen.getByTestId('nav-actualizari-badge').textContent).toBe('2 noi');
  });

  it('says "1 îmbunătățire" for one more line', async () => {
    mockApi([{ ...newest, improvements: ['Una.'], fixes: [] }]);
    mount();
    const dialog = await screen.findByRole('dialog', { name: newest.headline });
    expect(within(dialog).getByTestId('update-dialog-more').textContent).toBe(
      'și încă 1 îmbunătățire'
    );
  });

  it('leaves the count out when the highlights are everything', async () => {
    mockApi([{ ...newest, improvements: [], fixes: [] }]);
    mount();
    const again = await screen.findByRole('dialog', { name: newest.headline });
    expect(within(again).queryByTestId('update-dialog-more')).toBeNull();
  });

  it('stays shut for a release dismissed this session, while the badge stays', async () => {
    saveDismissedTag(newest.tag);
    mockApi([newest, reminders]);
    mount();
    expect((await screen.findByTestId('nav-actualizari-badge')).textContent).toBe('2 noi');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('acknowledges the newest release on "Am înțeles" and closes', async () => {
    mockApi([newest, reminders, first]);
    mount();
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: newest.headline });
    await user.click(within(dialog).getByRole('button', { name: 'Am înțeles' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(acknowledgements()).toEqual([{ tag: newest.tag }]));
    await waitFor(() => expect(screen.queryByTestId('nav-actualizari-badge')).toBeNull());
  });

  it('dismisses for the session with the cross and acknowledges nothing', async () => {
    mockApi([newest, reminders]);
    mount();
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: newest.headline });
    await user.click(within(dialog).getByRole('button', { name: 'Închide' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readDismissedTag()).toBe(newest.tag);
    expect(acknowledgements()).toEqual([]);
    expect(screen.getByTestId('nav-actualizari-badge').textContent).toBe('2 noi');
  });

  it('does not open, and shows no badge, when nothing is unread', async () => {
    mockApi([{ ...reminders, unread: false }, first]);
    mount();
    await screen.findByTestId('dashboard-page');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/releases'))).toBe(true)
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('nav-actualizari-badge')).toBeNull();
  });
});

describe('the Actualizări list', () => {
  it('groups the releases by month with their counts and marks the unread ones', async () => {
    mockApi([newest, { ...reminders, unread: false }, fixesOnly, first]);
    mount('/actualizari');
    await screen.findByTestId('updates-page');
    const months = screen.getAllByTestId('release-month');
    expect(months.map((month) => within(month).getByRole('heading').textContent)).toEqual([
      'Noiembrie 2026',
      'Octombrie 2026',
    ]);
    expect(within(months[1]!).getAllByTestId('release-row')).toHaveLength(3);

    const cards = screen.getAllByTestId('release-card');
    const chips = (card: HTMLElement) =>
      within(card)
        .getAllByTestId('release-chip')
        .map((chip) => chip.textContent);
    expect(chips(cards[0]!)).toEqual(['3 noi', '2 îmbunătățiri', '1 remediere']);
    expect(chips(cards[1]!)).toEqual(['1 nouă', '1 îmbunătățire']);
    expect(chips(cards[2]!)).toEqual(['2 remedieri']);
    expect(within(cards[0]!).getByText('Necitită')).toBeTruthy();
    expect(within(cards[1]!).queryByText('Necitită')).toBeNull();
    expect(cards[0]!.getAttribute('href')).toBe('/actualizari/2026.11.06');
    expect(
      screen.getByText(
        'Acestea sunt toate versiunile. Prima a fost publicată pe 23 octombrie 2026.'
      )
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks everything as read through the newest release', async () => {
    mockApi([newest, reminders, first]);
    mount('/actualizari');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Marchează toate ca citite' }));
    await waitFor(() => expect(acknowledgements()).toEqual([{ tag: newest.tag }]));
    await waitFor(() => expect(screen.queryByText('Necitită')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Marchează toate ca citite' })).toBeNull();
  });

  it('says so when there is no release yet', async () => {
    mockApi([]);
    mount('/actualizari');
    expect((await screen.findByTestId('updates-empty')).textContent).toBe(
      'Nicio actualizare încă.'
    );
  });
});

describe('the release page', () => {
  it('leaves out empty sections and acknowledges nothing for a read release', async () => {
    mockApi([newest, reminders, fixesOnly, first]);
    mount('/actualizari/2026.10.28');
    await screen.findByTestId('release-page');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(fixesOnly.headline);
    expect(screen.queryByTestId('release-features')).toBeNull();
    expect(screen.queryByTestId('release-improvements')).toBeNull();
    expect(
      within(screen.getByTestId('release-fixes'))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(fixesOnly.fixes);
    expect(screen.getByTestId('release-previous').textContent).toBe(
      `Versiunea anterioară, 23 octombrie${first.headline}`
    );
    expect(screen.getByTestId('release-all').textContent).toBe('Toate actualizările');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(acknowledgements()).toEqual([]);
  });

  it('shows the features with where to find them and acknowledges through the newest when unread', async () => {
    mockApi([newest, reminders, fixesOnly, first]);
    mount('/actualizari/2026.10.30');
    await screen.findByTestId('release-page');
    const features = screen.getByTestId('release-features');
    expect(within(features).getByText('Reamintiri automate')).toBeTruthy();
    expect(within(features).getByText('Client, fila Instruiri')).toBeTruthy();
    expect(screen.queryByTestId('release-fixes')).toBeNull();
    await waitFor(() => expect(acknowledgements()).toEqual([{ tag: newest.tag }]));
    await waitFor(() => expect(screen.queryByTestId('nav-actualizari-badge')).toBeNull());
  });

  it('has no previous release for the oldest', async () => {
    mockApi([{ ...newest, unread: false }, first]);
    mount('/actualizari/2026.10.23');
    await screen.findByTestId('release-page');
    expect(screen.queryByTestId('release-previous')).toBeNull();
    expect(screen.getByTestId('release-all').textContent).toBe('Toate actualizările');
  });

  it('calls the newest release the newest', async () => {
    mockApi([{ ...newest, unread: false }, first]);
    mount('/actualizari/2026.11.06');
    expect((await screen.findByTestId('release-all')).textContent).toBe(
      'Toate actualizărileAceasta e cea mai nouă versiune.'
    );
  });

  it('answers an unknown tag with the not-found state', async () => {
    mockApi([newest]);
    mount('/actualizari/2020.01.01');
    expect(await screen.findByTestId('release-not-found')).toBeTruthy();
  });
});

describe('the version in the footer', () => {
  it('links to the release page of the running release', async () => {
    vi.stubEnv('VITE_RELEASE_TAG', first.tag);
    mockApi([{ ...newest, unread: false }, first]);
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('commit-version').getAttribute('href')).toBe(
        '/actualizari/2026.10.23'
      )
    );
    expect(screen.getByTestId('commit-version').textContent).toBe('Versiune 2026.10.23');
  });

  it('stays text for a release with no update', async () => {
    vi.stubEnv('VITE_RELEASE_TAG', '2026.10.24');
    mockApi([{ ...newest, unread: false }, first]);
    mount();
    await screen.findByTestId('dashboard-page');
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith('/releases'))).toBe(true)
    );
    expect(screen.getByTestId('commit-version').tagName).toBe('SPAN');
  });
});

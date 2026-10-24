import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuideState, Release } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { guideProgress, welcomeGuide } from './guides';

const { captureEvent } = vi.hoisted(() => ({ captureEvent: vi.fn() }));
vi.mock('@/app/observability/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/observability/posthog')>()),
  captureEvent,
}));

const skipped: GuideState = {
  guide: 'welcome',
  version: 1,
  status: 'skipped',
  updatedAt: '2026-10-25T09:00:00.000Z',
};

const unreadRelease: Release = {
  tag: '2026.10.25',
  publishedAt: '2026-10-25T08:00:00.000Z',
  headline: 'Turul aplicației',
  lead: null,
  features: [],
  improvements: ['Lista de clienți se încarcă mai repede.'],
  fixes: [],
  unread: true,
};

const fetchMock = vi.fn<typeof fetch>();

function mockApi({ guides = [] as GuideState[], releases = [] as Release[] } = {}) {
  let states = guides;
  let unread = releases;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role: 'owner',
        },
      });
    }
    if (pathname === '/dashboard/summary') return Response.json(quietSummary);
    if (pathname === '/releases') return Response.json({ items: unread });
    if (pathname === '/releases/acknowledge' && method === 'POST') {
      unread = unread.map((release) => ({ ...release, unread: false }));
      return Response.json({ acknowledgedThrough: unreadRelease.tag });
    }
    if (pathname === '/me/guides') return Response.json({ items: states });
    if (pathname === '/me/guides/welcome' && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as Pick<GuideState, 'version' | 'status'>;
      const state = { guide: 'welcome', ...body, updatedAt: '2026-10-25T10:00:00.000Z' };
      states = [state];
      return Response.json(state);
    }
    return Response.json({ error: 'not_found', message: 'Not here.' }, { status: 404 });
  });
}

const recorded = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).endsWith('/me/guides/welcome') && init?.method)
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

const mount = (path = '/dashboard') => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  captureEvent.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('guideProgress', () => {
  it('counts a guide as not started without a state or with one for an earlier version', () => {
    expect(guideProgress(welcomeGuide, [])).toBe('not_started');
    expect(guideProgress({ ...welcomeGuide, version: 2 }, [skipped])).toBe('not_started');
    expect(guideProgress(welcomeGuide, [skipped])).toBe('skipped');
  });
});

describe('the welcome tour', () => {
  it('starts by itself on the dashboard and records a skip', async () => {
    mockApi();
    mount();

    const tooltip = await screen.findByTestId('guide-tooltip');
    expect(within(tooltip).getByTestId('guide-progress').textContent).toBe('1 din 4');
    await userEvent.setup().click(within(tooltip).getByTestId('guide-skip'));

    await waitFor(() => expect(screen.queryByTestId('guide-tooltip')).toBeNull());
    await waitFor(() => expect(recorded()).toEqual([{ version: 1, status: 'skipped' }]));
  });

  it('tells PostHog where the tour started and where it was finished or skipped', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    const tooltip = await screen.findByTestId('guide-tooltip');
    await user.click(within(tooltip).getByTestId('guide-next'));
    await waitFor(() => expect(screen.getByTestId('guide-progress').textContent).toBe('2 din 4'));
    await user.click(screen.getByTestId('guide-skip'));

    await waitFor(() =>
      expect(captureEvent.mock.calls).toEqual([
        ['guide_started', { guide: 'welcome', version: 1, step: 1 }],
        ['guide_skipped', { guide: 'welcome', version: 1, step: 2 }],
      ])
    );
  });

  it('records a completion after the last step', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    for (const step of [1, 2, 3, 4]) {
      await waitFor(() =>
        expect(screen.getByTestId('guide-progress').textContent).toBe(`${step} din 4`)
      );
      await user.click(screen.getByTestId('guide-next'));
    }

    await waitFor(() => expect(recorded()).toEqual([{ version: 1, status: 'completed' }]));
    expect(captureEvent).toHaveBeenLastCalledWith('guide_completed', {
      guide: 'welcome',
      version: 1,
      step: 4,
    });
  });

  it('skips on Escape', async () => {
    mockApi();
    mount();

    await screen.findByTestId('guide-tooltip');
    await userEvent.setup().keyboard('{Escape}');

    await waitFor(() => expect(recorded()).toEqual([{ version: 1, status: 'skipped' }]));
  });

  it('does not start again once seen', async () => {
    mockApi({ guides: [skipped] });
    mount();

    await screen.findByTestId('dashboard-todo');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByTestId('guide-tooltip')).toBeNull();
  });

  it('waits for the update dialog to close', async () => {
    mockApi({ releases: [unreadRelease] });
    mount();

    const dialog = await screen.findByTestId('update-dialog');
    expect(screen.queryByTestId('guide-tooltip')).toBeNull();
    await userEvent.setup().click(within(dialog).getByTestId('update-dialog-acknowledge'));

    expect(await screen.findByTestId('guide-tooltip')).toBeTruthy();
  });

  it('shows its status in Setări and starts again from there on the dashboard', async () => {
    mockApi({ guides: [skipped] });
    const runtime = mount('/setari');

    expect((await screen.findByTestId('guide-welcome-status')).textContent).toBe('Sărit');
    await userEvent.setup().click(screen.getByTestId('guide-welcome-replay'));

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    const tooltip = await screen.findByTestId('guide-tooltip');
    expect(within(tooltip).getByTestId('guide-progress').textContent).toBe('1 din 4');
  });
});

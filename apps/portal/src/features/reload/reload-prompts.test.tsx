import { I18nProvider } from '@lingui/react';
import { deployWindow } from '@ssm-usor/spa-runtime/version-watch';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/api/http';
import { activateLocale, i18n } from '@/app/i18n';
import * as posthog from '@/app/observability/posthog';

import { showNewVersionToast } from './new-version-toast';
import { ReloadPrompts } from './reload-prompts';
import {
  openOutdatedDialog,
  pageReload,
  type ReloadContext,
  resetReloadStore,
  useReloadContext,
} from './reload-store';

afterEach(() => {
  act(() => resetReloadStore());
  vi.useRealTimers();
});

function Page({ context }: { context: ReloadContext }) {
  useReloadContext(context);
  return null;
}

function mountPrompts(context?: ReloadContext) {
  return render(
    <I18nProvider i18n={i18n}>
      {context && <Page context={context} />}
      <ReloadPrompts running="local" />
    </I18nProvider>
  );
}

const dialog = () => screen.queryByTestId('reload-dialog');

describe('the new-version toast', () => {
  it('offers a reload and records that it was shown and used', async () => {
    const capture = vi.spyOn(posthog, 'captureEvent');
    const reload = vi.spyOn(pageReload, 'reload').mockImplementation(() => {});
    mountPrompts();

    act(() => showNewVersionToast());

    expect(await screen.findByText('A apărut o versiune nouă a portalului.')).toBeTruthy();
    expect(capture).toHaveBeenCalledWith('update_toast_shown', { client: 'portal' });
    await userEvent.click(screen.getByRole('button', { name: 'Reîncarcă' }));
    expect(capture).toHaveBeenCalledWith('reload_clicked', { prompt: 'toast' });
    expect(reload).toHaveBeenCalled();
  });

  it('once closed, stays away for that build in a reloaded or another tab', async () => {
    const fetchCommit = vi.fn(async () => Response.json({ commit: 'def' }));
    vi.stubGlobal('fetch', fetchCommit);
    const mount = () =>
      render(
        <I18nProvider i18n={i18n}>
          <ReloadPrompts running="abc" />
        </I18nProvider>
      );
    const showTab = () => act(() => void document.dispatchEvent(new Event('visibilitychange')));

    const first = mount();
    showTab();
    await screen.findByText('A apărut o versiune nouă a portalului.');
    await userEvent.click(screen.getByRole('button', { name: 'Close toast' }));
    await waitFor(() =>
      expect(screen.queryByText('A apărut o versiune nouă a portalului.')).toBeNull()
    );
    first.unmount();

    mount();
    showTab();
    await waitFor(() => expect(fetchCommit).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText('A apărut o versiune nouă a portalului.')).toBeNull();
  });
});

describe('the reload dialog', () => {
  it('opens when the API refuses the client as outdated, and cannot be dismissed', async () => {
    const capture = vi.spyOn(posthog, 'captureEvent');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: 'client_outdated', message: 'Outdated.' }, { status: 426 })
      )
    );
    mountPrompts();

    await expect(apiFetch('/portal/me', { baseUrl: 'http://localhost:8787' })).rejects.toThrow();

    expect(await screen.findByText('Pagina trebuie reîncărcată')).toBeTruthy();
    expect(capture).toHaveBeenCalledWith('client_outdated_shown', {
      client: 'portal',
      cause: '426',
    });
    expect(capture).not.toHaveBeenCalledWith('api_request_failed', expect.anything());
    expect(within(dialog()!).getAllByRole('button')).toHaveLength(1);

    await userEvent.keyboard('{Escape}');
    fireEvent.pointerDown(document.body);
    expect(dialog()).toBeTruthy();
  });

  it('opens when a code file of the page fails to load', async () => {
    mountPrompts();
    const event = new Event('vite:preloadError', { cancelable: true });

    act(() => {
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByTestId('reload-dialog')).toBeTruthy();
  });

  it('reloads only when asked, stamping the reload for the next dialog', async () => {
    const reload = vi.spyOn(pageReload, 'reload').mockImplementation(() => {});
    const capture = vi.spyOn(posthog, 'captureEvent');
    mountPrompts();
    act(() => openOutdatedDialog('426'));
    expect(reload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('reload-dialog-action'));

    expect(reload).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('reload_clicked', { prompt: 'dialog' });
    expect(Number(sessionStorage.getItem('ssm-usor:portal-reload-at'))).toBeGreaterThan(0);
  });

  it('during a test, says which answers are saved and which one to tick again', async () => {
    mountPrompts({ kind: 'test', question: 4 });
    act(() => openOutdatedDialog('426'));

    expect((await screen.findByTestId('reload-dialog-safe')).textContent).toBe(
      'Răspunsurile la întrebările 1–3 sunt salvate. După reîncărcare vei bifa din nou răspunsul la întrebarea 4.'
    );
  });

  it('on the first question of a test, says the test stays open', async () => {
    mountPrompts({ kind: 'test', question: 1 });
    act(() => openOutdatedDialog('426'));

    expect((await screen.findByTestId('reload-dialog-safe')).textContent).toMatch(
      /^Testul rămâne deschis\..*întrebarea 1\.$/
    );
  });

  it('while signing, says nothing is signed yet', async () => {
    mountPrompts({ kind: 'signing', signedBefore: false });
    act(() => openOutdatedDialog('426'));

    expect((await screen.findByTestId('reload-dialog-safe')).textContent).toBe(
      'Nu s-a semnat încă nimic. După reîncărcare poți semna.'
    );
  });

  it('elsewhere, says nothing already sent is lost', async () => {
    mountPrompts();
    act(() => openOutdatedDialog('426'));

    expect((await screen.findByTestId('reload-dialog-safe')).textContent).toBe(
      'Nimic din ce ai trimis deja nu se pierde.'
    );
  });

  it('within a minute of its own reload, asks to wait and counts down to the end of it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const now = Date.now();
    sessionStorage.setItem('ssm-usor:portal-reload-at', String(now - 18_000));
    mountPrompts();
    act(() => openOutdatedDialog('426', now));

    const action = screen.getByTestId('reload-dialog-action') as HTMLButtonElement;
    expect(screen.getByText('Actualizarea nu s-a încheiat încă')).toBeTruthy();
    expect(action.disabled).toBe(true);
    expect(action.textContent).toBe('Reîncarcă în 0:42');

    await act(() => vi.advanceTimersByTimeAsync(deployWindow - 18_000));

    expect(action.disabled).toBe(false);
    expect(action.textContent).toBe('Reîncarcă');
    expect(screen.getByText('Pagina trebuie reîncărcată')).toBeTruthy();
  });

  it('speaks English to a participant who reads the portal in English', async () => {
    activateLocale('en');
    mountPrompts({ kind: 'test', question: 4 });
    act(() => openOutdatedDialog('426'));

    await waitFor(() => expect(screen.getByText('This page needs to be reloaded')).toBeTruthy());
    expect(screen.getByTestId('reload-dialog-safe').textContent).toBe(
      'Your answers to questions 1–3 are saved. After reloading, tick your answer to question 4 again.'
    );
    expect(screen.getByTestId('reload-dialog-action').textContent).toBe('Reload');
  });
});

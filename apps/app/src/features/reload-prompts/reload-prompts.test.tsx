import { Toaster } from '@ssm-usor/ui/components/sonner';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch } from '@/api/http';

import { keptTextLifetime } from './kept-text';
import { startVersionCheck, versionCheckInterval } from './new-version-toast';
import { isCodeFileError, openReloadDialog, resetReloadDialog } from './reload-dialog-store';
import { browserPage } from './reload-page';
import { ReloadPrompts } from './reload-prompts';
import { newVersionText, reloadDialogText, restoredText } from './reload-text';

const fetchMock = vi.fn<typeof fetch>();
let reload: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  reload = vi.spyOn(browserPage, 'reload').mockImplementation(() => {});
});

afterEach(() => {
  act(() => resetReloadDialog());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function showTab(state: DocumentVisibilityState = 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const deployed = (commit: string) =>
  fetchMock.mockImplementation(async () => Response.json({ commit }));

describe('the new-version toast', () => {
  let stop = () => {};
  beforeEach(() => {
    render(<Toaster closeButton />);
  });
  afterEach(() => stop());

  it('shows when the deployed commit differs from the one running, and reloads on its button', async () => {
    deployed('bbbbbbb');
    stop = startVersionCheck('aaaaaaa');
    showTab();
    expect(await screen.findByText(newVersionText.title)).toBeTruthy();
    expect(screen.getByText(newVersionText.description)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    await userEvent.click(screen.getByRole('button', { name: newVersionText.action }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('stays away while the running commit is the deployed one', async () => {
    deployed('aaaaaaa');
    stop = startVersionCheck('aaaaaaa');
    showTab();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText(newVersionText.title)).toBeNull();
  });

  it('never asks from a local build', () => {
    deployed('bbbbbbb');
    stop = startVersionCheck('local');
    showTab();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays silent when the version cannot be read', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    stop = startVersionCheck('aaaaaaa');
    showTab();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByText(newVersionText.title)).toBeNull();
  });

  it('asks every ten minutes while the tab is in view, and not while it is hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    deployed('aaaaaaa');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    stop = startVersionCheck('aaaaaaa');
    vi.advanceTimersByTime(versionCheckInterval);
    expect(fetchMock).toHaveBeenCalledOnce();
    showTab('hidden');
    vi.advanceTimersByTime(versionCheckInterval * 3);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('once closed, comes back only for a newer build than the one it announced', async () => {
    deployed('bbbbbbb');
    stop = startVersionCheck('aaaaaaa');
    showTab();
    await screen.findByText(newVersionText.title);
    await userEvent.click(screen.getByRole('button', { name: 'Close toast' }));
    await waitFor(() => expect(screen.queryByText(newVersionText.title)).toBeNull());

    stop();
    stop = startVersionCheck('aaaaaaa');
    showTab();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText(newVersionText.title)).toBeNull();

    deployed('ccccccc');
    showTab();
    expect(await screen.findByText(newVersionText.title)).toBeTruthy();
  });
});

function Prompts({ page = '/clienti/c1/angajati/e1/editare' }: { page?: string }) {
  return (
    <>
      <Toaster closeButton />
      <ReloadPrompts page={() => page} subscribeToPage={() => () => {}} checkVersion={false} />
    </>
  );
}

const baseUrl = 'http://localhost:8787';
const refused = () =>
  fetchMock.mockImplementation(async () =>
    Response.json({ error: 'client_outdated', message: 'Reload.' }, { status: 426 })
  );

describe('the reload dialog', () => {
  it('opens when the API refuses this build, and says a refused save was not saved', async () => {
    render(<Prompts />);
    refused();
    await apiFetch('/clients/c1', { baseUrl, method: 'PATCH' }).catch(() => {});
    const dialog = await screen.findByTestId('reload-dialog');
    expect(screen.getByRole('heading', { name: reloadDialogText.title })).toBeTruthy();
    expect(dialog.textContent).toContain(reloadDialogText.text);
    expect(dialog.textContent).toContain(reloadDialogText.kept);
    expect(screen.getByTestId('reload-dialog-unsaved').textContent).toBe(reloadDialogText.unsaved);
  });

  it('says nothing about an unsaved change when a read was refused', async () => {
    render(<Prompts />);
    refused();
    await apiFetch('/clients', { baseUrl }).catch(() => {});
    await screen.findByTestId('reload-dialog');
    expect(screen.queryByTestId('reload-dialog-unsaved')).toBeNull();
  });

  it('opens when a code file of this build fails to load, and keeps Vite from throwing', async () => {
    render(<Prompts />);
    const event = new Event('vite:preloadError', { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByTestId('reload-dialog')).toBeTruthy();
    expect(isCodeFileError(new TypeError('Cannot read properties of undefined'))).toBe(true);
  });

  it('tells a failed code file from another route error', () => {
    expect(
      isCodeFileError(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
    ).toBe(true);
    expect(isCodeFileError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isCodeFileError(new Error('API request failed (500).'))).toBe(false);
  });

  it('cannot be dismissed and never reloads by itself', async () => {
    render(<Prompts />);
    act(() => openReloadDialog('426'));
    const user = userEvent.setup();
    await screen.findByTestId('reload-dialog');
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('[data-slot="dialog-overlay"]')!);
    expect(screen.getByTestId('reload-dialog')).toBeTruthy();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      reloadDialogText.action,
    ]);
    expect(reload).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('reload-dialog-action'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('on a phone opens as a sheet without a handle or a close button', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 767px)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );
    render(<Prompts />);
    act(() => openReloadDialog('code_file'));
    const sheet = await screen.findByTestId('reload-dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('reload-dialog')).toBe(sheet);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      reloadDialogText.action,
    ]);
  });

  it('within a minute of its own reload, counts down to the end of that minute', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-10T14:32:00Z'));
    render(<Prompts />);
    act(() => openReloadDialog('426'));
    await userEvent.click(await screen.findByTestId('reload-dialog-action'));
    act(() => resetReloadDialog());

    vi.setSystemTime(new Date('2026-11-10T14:32:18Z'));
    act(() => openReloadDialog('426'));
    const dialog = await screen.findByTestId('reload-dialog');
    expect(dialog.dataset.state).toBe('waiting');
    expect(screen.getByRole('heading', { name: reloadDialogText.waitTitle })).toBeTruthy();
    const action = screen.getByTestId('reload-dialog-action') as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    expect(action.textContent).toBe('Reîncarcă în 0:42');

    act(() => vi.advanceTimersByTime(30_000));
    expect(action.textContent).toBe('Reîncarcă în 0:12');
    act(() => vi.advanceTimersByTime(12_000));
    expect(action.disabled).toBe(false);
    expect(action.textContent).toBe(reloadDialogText.action);
    expect(screen.getByRole('heading', { name: reloadDialogText.title })).toBeTruthy();
  });

  it('opens unlocked a minute or more after its own reload', async () => {
    sessionStorage.setItem('ssm-usor.reload-dialog-reloaded-at', String(Date.now() - 61_000));
    render(<Prompts />);
    act(() => openReloadDialog('426'));
    const action = (await screen.findByTestId('reload-dialog-action')) as HTMLButtonElement;
    expect(action.disabled).toBe(false);
  });
});

type Values = { title: string; notes: string; secret: string; skipped: string };

function EmployeeLikeForm({
  defaults,
  resetTo,
  onSubmit = () => {},
}: {
  defaults: Values;
  resetTo?: Values;
  onSubmit?: (values: Values) => void;
}) {
  const form = useForm<Values>({ defaultValues: defaults });
  useEffect(() => {
    if (!resetTo) return;
    const timer = setTimeout(() => form.reset(resetTo), 300);
    return () => clearTimeout(timer);
  }, [form, resetTo]);
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <label>
        Titlu
        <input {...form.register('title')} />
      </label>
      <Controller
        control={form.control}
        name="notes"
        render={({ field }) => (
          <label>
            Note
            <textarea {...field} />
          </label>
        )}
      />
      <label>
        Parolă
        <input type="password" {...form.register('secret')} />
      </label>
      <label>
        Ocolit
        <input data-no-keep {...form.register('skipped')} />
      </label>
      <button type="submit">Salvează</button>
    </form>
  );
}

const empty: Values = { title: '', notes: '', secret: '', skipped: '' };

async function typeAndRefuse(defaults: Values = empty) {
  render(
    <>
      <Prompts />
      <EmployeeLikeForm defaults={defaults} />
    </>
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Titlu'), ' scris');
  await user.type(screen.getByLabelText('Note'), 'Primul rând');
  await user.type(screen.getByLabelText('Parolă'), 'secret');
  await user.type(screen.getByLabelText('Ocolit'), 'nu');
  act(() => openReloadDialog('426'));
  await screen.findByTestId('reload-dialog');
  cleanup();
  act(() => resetReloadDialog());
}

const kept = () =>
  JSON.parse(sessionStorage.getItem('ssm-usor.kept-text') ?? 'null') as {
    fields: { key: string; value: string }[];
  } | null;

describe('keeping what was typed across the reload', () => {
  it('keeps only the text fields typed into, never a password or a field marked to skip', async () => {
    await typeAndRefuse({ ...empty, title: 'Ana' });
    expect(kept()?.fields.map(({ key, value }) => [key, value])).toEqual([
      ['title', 'Ana scris'],
      ['notes', 'Primul rând'],
    ]);
  });

  it('puts the text back into the same form after the reload, where the form reads it', async () => {
    await typeAndRefuse({ ...empty, title: 'Ana' });
    const onSubmit = vi.fn();
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={{ ...empty, title: 'Ana' }} onSubmit={onSubmit} />
      </>
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Ana scris')
    );
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Primul rând');
    expect((screen.getByLabelText('Parolă') as HTMLInputElement).value).toBe('');
    expect(await screen.findByText(restoredText)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        ...empty,
        title: 'Ana scris',
        notes: 'Primul rând',
      })
    );
  });

  it('waits for a form that fills itself from loaded data, and is not wiped by that reset', async () => {
    await typeAndRefuse({ ...empty, title: 'Ana' });
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={empty} resetTo={{ ...empty, title: 'Ana' }} />
      </>
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Ana scris')
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Ana scris');
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Primul rând');
  });

  it('leaves alone a field that holds something else than before the typing', async () => {
    await typeAndRefuse({ ...empty, title: 'Ana' });
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={{ ...empty, title: 'Maria' }} />
      </>
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Primul rând')
    );
    expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Maria');
  });

  it('restores nothing on another page', async () => {
    await typeAndRefuse();
    render(
      <>
        <Prompts page="/clienti" />
        <EmployeeLikeForm defaults={empty} />
      </>
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText(restoredText)).toBeNull();
  });

  it('drops what it kept after fifteen minutes', async () => {
    await typeAndRefuse();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + keptTextLifetime + 1_000);
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={empty} />
      </>
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('');
    expect(kept()).toBeNull();
    expect(screen.queryByText(restoredText)).toBeNull();
  });
});

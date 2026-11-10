import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Toaster } from '@ssm-usor/ui/components/sonner';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(dialog.textContent).not.toContain(reloadDialogText.kept);
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

  it('on a phone opens as the same dialog, without a close button', async () => {
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
    expect(sheet.dataset.slot).toBe('dialog-content');
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
    expect(dialog.dataset.phase).toBe('waiting');
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

  it('opens above a dialog that is already open, and its button reloads', async () => {
    function FormDialog() {
      return (
        <Dialog open>
          <DialogContent data-testid="form-dialog">
            <DialogTitle>Angajat</DialogTitle>
            <DialogDescription>Datele angajatului</DialogDescription>
            <textarea id="employee-notes" aria-label="Note" />
          </DialogContent>
        </Dialog>
      );
    }
    render(
      <>
        <Prompts />
        <FormDialog />
      </>
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Note'), 'Scris în fereastră');
    act(() => openReloadDialog('426', { unsavedChange: true }));

    const reloadDialog = await screen.findByRole('dialog', { name: reloadDialogText.title });
    const formDialog = screen.getByTestId('form-dialog');
    expect(formDialog.contains(reloadDialog)).toBe(false);
    expect(reloadDialog.closest('[aria-hidden="true"], [inert]')).toBeNull();
    expect(reloadDialog.style.pointerEvents).toBe('auto');
    expect(formDialog.style.pointerEvents).toBe('none');
    expect(screen.queryByTestId('reload-dialog-kept')).toBeNull();
    await user.click(within(reloadDialog).getByRole('button', { name: reloadDialogText.action }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('opens unlocked a minute or more after its own reload', async () => {
    sessionStorage.setItem('ssm-usor.reload-dialog-reloaded-at', String(Date.now() - 61_000));
    render(<Prompts />);
    act(() => openReloadDialog('426'));
    const action = (await screen.findByTestId('reload-dialog-action')) as HTMLButtonElement;
    expect(action.disabled).toBe(false);
  });
});

type Values = { title: string; notes: string; summary: string; skipped: string };

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
        Rezumat
        <textarea {...form.register('summary')} />
      </label>
      <label>
        Ocolit
        <textarea data-no-keep {...form.register('skipped')} />
      </label>
      <button type="submit">Salvează</button>
    </form>
  );
}

const empty: Values = { title: '', notes: '', summary: '', skipped: '' };

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
  await user.type(screen.getByLabelText('Rezumat'), ' pe scurt');
  await user.type(screen.getByLabelText('Ocolit'), 'nu');
  act(() => openReloadDialog('426'));
  const dialog = await screen.findByTestId('reload-dialog');
  const promised = dialog.textContent?.includes(reloadDialogText.kept);
  cleanup();
  act(() => resetReloadDialog());
  return { promised };
}

const kept = () =>
  JSON.parse(sessionStorage.getItem('ssm-usor.kept-text') ?? 'null') as {
    fields: { key: string; value: string }[];
  } | null;

const withSummary = { ...empty, title: 'Ana', summary: 'Ana' };

describe('keeping what was typed across the reload', () => {
  it('keeps only the long text typed into, never a short field or one marked to skip', async () => {
    const { promised } = await typeAndRefuse(withSummary);
    expect(kept()?.fields.map(({ key, value }) => [key, value])).toEqual([
      ['notes', 'Primul rând'],
      ['summary', 'Ana pe scurt'],
    ]);
    expect(promised).toBe(true);
  });

  it('promises nothing when only short fields were typed into', async () => {
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={empty} />
      </>
    );
    await userEvent.type(screen.getByLabelText('Titlu'), 'Ana');
    act(() => openReloadDialog('426'));
    await screen.findByTestId('reload-dialog');
    expect(screen.queryByTestId('reload-dialog-kept')).toBeNull();
    expect(kept()).toBeNull();
  });

  it('puts the text back into the same form after the reload, where the form reads it', async () => {
    await typeAndRefuse(withSummary);
    const onSubmit = vi.fn();
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={withSummary} onSubmit={onSubmit} />
      </>
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Rezumat') as HTMLTextAreaElement).value).toBe('Ana pe scurt')
    );
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Primul rând');
    expect((screen.getByLabelText('Titlu') as HTMLInputElement).value).toBe('Ana');
    expect(await screen.findByText(restoredText)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        ...withSummary,
        notes: 'Primul rând',
        summary: 'Ana pe scurt',
      })
    );
  });

  it('waits for a form that fills itself from loaded data, and is not wiped by that reset', async () => {
    await typeAndRefuse(withSummary);
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={empty} resetTo={withSummary} />
      </>
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Rezumat') as HTMLTextAreaElement).value).toBe('Ana pe scurt')
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect((screen.getByLabelText('Rezumat') as HTMLTextAreaElement).value).toBe('Ana pe scurt');
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Primul rând');
  });

  it('leaves alone a field that holds something else than before the typing', async () => {
    await typeAndRefuse(withSummary);
    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={{ ...withSummary, summary: 'Maria' }} />
      </>
    );
    await waitFor(() =>
      expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Primul rând')
    );
    expect((screen.getByLabelText('Rezumat') as HTMLTextAreaElement).value).toBe('Maria');
  });

  it('restores nothing on another page, and drops the text so a later visit gets none', async () => {
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
    expect(kept()).toBeNull();
    cleanup();

    render(
      <>
        <Prompts />
        <EmployeeLikeForm defaults={empty} />
      </>
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('');
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

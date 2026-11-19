import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from '@/api/http';
import { sessionExpiredMessage } from '@/lib/api-errors';

import { LoadFailed } from './load-failed';

describe('LoadFailed', () => {
  it('shows the page line as an alert and tries again on request', async () => {
    const retry = vi.fn();
    render(
      <LoadFailed testId="notes-error" onRetry={retry}>
        Nu am putut încărca notițele.
      </LoadFailed>
    );
    const notice = screen.getByRole('alert');
    expect(notice.dataset.testid).toBe('notes-error');
    expect(notice.textContent).toContain('Nu am putut încărca notițele.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('holds the retry while the page is already loading again', () => {
    render(
      <LoadFailed onRetry={() => undefined} busy>
        Nu am putut încărca notițele.
      </LoadFailed>
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Încearcă din nou' }).disabled
    ).toBe(true);
  });

  it('offers no retry without a way to try again', () => {
    render(<LoadFailed>Nu am putut încărca notițele.</LoadFailed>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('words an expired session the same on every page', () => {
    render(
      <LoadFailed
        error={new ApiHttpError(401, { error: 'unauthorized' })}
        onRetry={() => undefined}
      >
        Nu am putut încărca notițele.
      </LoadFailed>
    );
    expect(screen.getByRole('alert').textContent).toContain(sessionExpiredMessage);
    expect(screen.getByRole('alert').textContent).not.toContain('notițele');
  });

  it('keeps the page line for any other cause', () => {
    render(
      <LoadFailed error={new ApiHttpError(500, { error: 'internal' })}>
        Nu am putut încărca notițele.
      </LoadFailed>
    );
    expect(screen.getByRole('alert').textContent).toContain('Nu am putut încărca notițele.');
  });

  it('does not submit the form it sits in', async () => {
    const submit = vi.fn((event: Event) => event.preventDefault());
    render(
      <form onSubmit={(event) => submit(event.nativeEvent)}>
        <LoadFailed onRetry={() => undefined}>Nu am putut verifica datele clientului.</LoadFailed>
      </form>
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(submit).not.toHaveBeenCalled();
  });
});

import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import App from './App';
import { type AppRuntime, createAppRuntime } from './app-runtime';
import type { AuthClient } from './auth/auth-store';
import { createQueryClient } from './lib/query-client';
import { authFixture, makeSession } from './test/auth-fixture';

const runtimes: AppRuntime[] = [];
afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.dispose());
});

function mount(client: AuthClient | null, path = '/dashboard') {
  const runtime = createAppRuntime(
    client,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] })
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

describe('dashboard authentication and routing', () => {
  it('validates empty fields and email format before contacting Supabase', async () => {
    const { client } = authFixture();
    mount(client, '/login');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));
    expect(await screen.findByText('Introdu adresa de email.')).toBeTruthy();
    expect(screen.getByText('Introdu parola.')).toBeTruthy();
    expect(screen.getByLabelText('Adresă de email').getAttribute('aria-invalid')).toBe('true');
    expect(client.signInWithPassword).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Adresă de email'), 'not-an-email');
    await user.type(screen.getByLabelText('Parolă'), 'some-password');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));
    expect(await screen.findByText('Introdu o adresă de email validă.')).toBeTruthy();
    expect(client.signInWithPassword).not.toHaveBeenCalled();
  });

  it('preserves passwords unchanged and permits retrying a server-rejected form', async () => {
    const { client } = authFixture();
    mount(client, '/login');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    await user.type(screen.getByLabelText('Adresă de email'), 'review@example.test');
    await user.type(screen.getByLabelText('Parolă'), '  password with spaces  ');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));
    await screen.findByRole('alert');
    expect(client.signInWithPassword).toHaveBeenCalledWith({
      email: 'review@example.test',
      password: '  password with spaces  ',
    });
    client.signInWithPassword.mockResolvedValue({ data: { session: makeSession() }, error: null });
    await user.clear(screen.getByLabelText('Parolă'));
    await user.type(screen.getByLabelText('Parolă'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));
    await screen.findByRole('heading', { name: 'Spațiul tău de lucru' });
    expect(client.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it('redirects a signed-out direct dashboard visit to login', async () => {
    const { client } = authFixture();
    const runtime = mount(client);
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    expect(runtime.router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'Spațiul tău de lucru' })).toBeNull();
  });

  it('waits for restored authentication before showing protected content', async () => {
    const { client } = authFixture();
    let resolve!: (value: Awaited<ReturnType<AuthClient['getSession']>>) => void;
    client.getSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const runtime = mount(client);
    expect(screen.getByRole('status').textContent).toBe('Se încarcă…');
    expect(screen.queryByRole('heading', { name: 'Bine ai revenit' })).toBeNull();
    await act(async () => resolve({ data: { session: makeSession() }, error: null }));
    await screen.findByRole('heading', { name: 'Spațiul tău de lucru' });
    expect(runtime.router.state.location.pathname).toBe('/dashboard');
  });

  it('shows invalid credentials without navigating or caching the password', async () => {
    const { client } = authFixture();
    const runtime = mount(client, '/login');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    await user.type(screen.getByLabelText('Adresă de email'), 'review@example.test');
    await user.type(screen.getByLabelText('Parolă'), 'incorrect-password');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Adresa de email sau parola este incorectă.'
    );
    expect(runtime.router.state.location.pathname).toBe('/login');
    expect(runtime.queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('logs in with the SDK, displays the account, and logs out with an empty query cache', async () => {
    const { client } = authFixture();
    client.signInWithPassword.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const runtime = mount(client, '/login');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    await user.type(screen.getByLabelText('Adresă de email'), 'review@example.test');
    await user.type(screen.getByLabelText('Parolă'), 'test-password');
    await user.click(screen.getByRole('button', { name: 'Autentificare' }));
    await screen.findByRole('heading', { name: 'Spațiul tău de lucru' });
    expect(client.signInWithPassword).toHaveBeenCalledWith({
      email: 'review@example.test',
      password: 'test-password',
    });
    expect(screen.getByText('review@example.test')).toBeTruthy();
    runtime.queryClient.setQueryData(['private-client-data'], { name: 'Private client' });
    await user.click(screen.getByRole('button', { name: 'Deconectare' }));
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    expect(client.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(runtime.queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(screen.queryByText('review@example.test')).toBeNull();
    await act(async () => runtime.router.navigate({ to: '/dashboard' }));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/login'));
  });

  it('redirects an existing session away from login', async () => {
    const { client } = authFixture(makeSession());
    const runtime = mount(client, '/login');
    await screen.findByRole('heading', { name: 'Spațiul tău de lucru' });
    expect(runtime.router.state.location.pathname).toBe('/dashboard');
  });

  it('reacts to remote sign-out and removes protected content and cached data', async () => {
    const fixture = authFixture(makeSession());
    const runtime = mount(fixture.client);
    await screen.findByRole('heading', { name: 'Spațiul tău de lucru' });
    runtime.queryClient.setQueryData(['private-data'], 'private');
    await act(async () => fixture.emit('SIGNED_OUT', null));
    await screen.findByRole('heading', { name: 'Bine ai revenit' });
    expect(runtime.queryClient.getQueryData(['private-data'])).toBeUndefined();
    expect(screen.queryByText('review@example.test')).toBeNull();
  });

  it('keeps the session when sign-out fails and offers a retry', async () => {
    const { client } = authFixture(makeSession());
    client.signOut.mockResolvedValue({ error: { message: 'Network unavailable' } });
    const runtime = mount(client);
    await screen.findByRole('heading', { name: 'Spațiul tău de lucru' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Deconectare' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Deconectarea nu a reușit');
    expect(runtime.auth.getSnapshot().session?.user.id).toBe('user-one');
  });

  it('shows a recoverable startup error when session restoration fails', async () => {
    const { client } = authFixture();
    client.getSession.mockRejectedValue(new Error('Network unavailable'));
    mount(client);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Nu am putut restabili sesiunea'
    );
  });

  it('shows an unavailable state when public Supabase configuration is absent', () => {
    mount(null);
    expect(screen.getByRole('alert').textContent).toContain('nu este încă configurat');
    expect(screen.queryByLabelText('Parolă')).toBeNull();
  });

  it('renders an unknown route without exposing internal errors', async () => {
    mount(authFixture().client, '/missing-page');
    await screen.findByRole('heading', { name: 'Pagina nu a fost găsită' });
  });
});

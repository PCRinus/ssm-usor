import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/lib/query-client';
import { authFixture, makeSession } from '@/test/auth-fixture';

import { createAuthStore } from './auth-store';

describe('Google sign-in', () => {
  it('exchanges a code once, however often it is completed', async () => {
    const fixture = authFixture();
    fixture.client.exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession() },
      error: null,
    });
    const auth = createAuthStore(fixture.client, createQueryClient());

    await Promise.all([auth.completeOAuth('code-abc'), auth.completeOAuth('code-abc')]);
    await auth.completeOAuth('code-abc');

    expect(fixture.client.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(auth.getSnapshot().session?.user.id).toBe('user-one');
    auth.dispose();
  });
});

describe('a recovery link across reloads', () => {
  async function recovered() {
    const fixture = authFixture();
    fixture.client.verifyOtp.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const auth = createAuthStore(fixture.client, createQueryClient());
    await auth.verifyRecovery('hash-abc');
    auth.dispose();
  }

  it('is remembered in the tab for the account it signed in, and for no other', async () => {
    await recovered();

    const same = createAuthStore(authFixture(makeSession()).client, createQueryClient());
    await same.ready;
    expect(same.isRecoverySession(same.getSnapshot().session)).toBe(true);
    same.dispose();

    const other = createAuthStore(
      authFixture(makeSession('user-two', 'second@example.test')).client,
      createQueryClient()
    );
    await other.ready;
    expect(other.isRecoverySession(other.getSnapshot().session)).toBe(false);
    other.dispose();
    expect(sessionStorage.length).toBe(0);
  });

  it('is forgotten on signing out', async () => {
    await recovered();
    const auth = createAuthStore(authFixture(makeSession()).client, createQueryClient());
    await auth.ready;

    await auth.signOut();

    expect(sessionStorage.length).toBe(0);
    auth.dispose();
  });

  it('is forgotten once the new password is set', async () => {
    await recovered();
    const auth = createAuthStore(authFixture(makeSession()).client, createQueryClient());
    await auth.ready;

    await auth.updatePassword('ParolaNoua1', { acceptCurrent: true });

    expect(auth.isRecoverySession(auth.getSnapshot().session)).toBe(false);
    expect(sessionStorage.length).toBe(0);
    auth.dispose();
  });

  it('still works in the page without storage', async () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const fixture = authFixture();
    fixture.client.verifyOtp.mockResolvedValue({ data: { session: makeSession() }, error: null });
    const auth = createAuthStore(fixture.client, createQueryClient());

    await auth.verifyRecovery('hash-abc');

    expect(auth.isRecoverySession(auth.getSnapshot().session)).toBe(true);
    auth.dispose();
    blocked.mockRestore();
  });
});

import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { disposeRuntimes, fakeAuthClient, mountPortal } from '@/test/portal';

afterEach(disposeRuntimes);

describe('the portal application', () => {
  it('opens the sign-in page once the session is restored and there is none', async () => {
    mountPortal(fakeAuthClient());
    expect(await screen.findByTestId('sign-in-page')).toBeTruthy();
  });

  it('says the portal is unavailable when authentication is not configured', async () => {
    mountPortal(null);
    expect(await screen.findByTestId('auth-unavailable')).toBeTruthy();
  });

  it('answers an unknown address with the not-found page', async () => {
    mountPortal(fakeAuthClient(), '/nowhere');
    expect(await screen.findByTestId('not-found-page')).toBeTruthy();
  });
});

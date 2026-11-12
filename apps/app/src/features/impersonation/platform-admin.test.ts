import { describe, expect, it } from 'vitest';

import { adminAreaUrl } from './platform-admin';

describe('the admin area address', () => {
  it('is the member app’s host with admin in place of app', () => {
    expect(adminAreaUrl({ protocol: 'https:', hostname: 'app.ssmusor.ro' })).toBe(
      'https://admin.ssmusor.ro/'
    );
    expect(adminAreaUrl({ protocol: 'https:', hostname: 'app.non-prod.ssmusor.ro' })).toBe(
      'https://admin.non-prod.ssmusor.ro/'
    );
  });

  it('is the local admin app anywhere else', () => {
    expect(adminAreaUrl({ protocol: 'http:', hostname: 'localhost' })).toBe(
      'http://localhost:5176/'
    );
    expect(adminAreaUrl({ protocol: 'https:', hostname: 'myapp.example.ro' })).toBe(
      'http://localhost:5176/'
    );
  });
});

import { describe, expect, it } from 'vitest';

import { memberAppOrigin } from './member-app';

describe('the member app origin', () => {
  it('is the admin host with app in place of admin, in each environment', () => {
    expect(memberAppOrigin('admin.ssmusor.ro', undefined)).toBe('https://app.ssmusor.ro');
    expect(memberAppOrigin('admin.non-prod.ssmusor.ro', undefined)).toBe(
      'https://app.non-prod.ssmusor.ro'
    );
  });

  it('ignores the configured address on a deployed host', () => {
    expect(memberAppOrigin('admin.ssmusor.ro', 'http://localhost:5173')).toBe(
      'https://app.ssmusor.ro'
    );
  });

  it('is the configured address on localhost, else the member app’s dev server', () => {
    expect(memberAppOrigin('localhost', 'http://localhost:5199/some/path')).toBe(
      'http://localhost:5199'
    );
    expect(memberAppOrigin('127.0.0.1', undefined)).toBe('http://localhost:5173');
    expect(memberAppOrigin('localhost', '')).toBe('http://localhost:5173');
    expect(memberAppOrigin('localhost', 'not a url')).toBe('http://localhost:5173');
  });
});

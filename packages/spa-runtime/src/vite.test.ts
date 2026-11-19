import { afterEach, describe, expect, it, vi } from 'vitest';

import { commitSha } from './vite';

afterEach(() => vi.unstubAllEnvs());

describe('commitSha', () => {
  it('takes the commit the build was given', () => {
    vi.stubEnv('GIT_COMMIT_SHA', ' abc123 ');
    expect(commitSha()).toBe('abc123');
  });
});

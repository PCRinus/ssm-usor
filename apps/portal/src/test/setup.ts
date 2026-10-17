import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

afterEach(cleanup);

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

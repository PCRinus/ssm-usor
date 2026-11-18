import { installUiTestEnvironment } from '@ssm-usor/spa-runtime/testing/jsdom';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The default 1 s wait for an element runs out when several suites share the machine.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);

afterEach(() => vi.restoreAllMocks());

installUiTestEnvironment();

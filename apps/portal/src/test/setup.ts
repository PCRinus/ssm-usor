import { installUiTestEnvironment } from '@ssm-usor/spa-runtime/testing/jsdom';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';

import { activateLocale, sourceLocale } from '@/app/i18n';

// The default 1 s wait for an element runs out when several suites share the machine, and a
// page that renders in 1.2 s fails as missing. A wait ends as soon as the element appears.
configure({ asyncUtilTimeout: 5_000 });

beforeAll(() => activateLocale(sourceLocale));

afterEach(cleanup);

afterEach(() => activateLocale(sourceLocale));

// jsdom reports en-US; the portal's tests read the Romanian a Romanian browser gets.
beforeEach(() => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ro-RO', 'ro']);
});

afterEach(() => vi.restoreAllMocks());

installUiTestEnvironment();

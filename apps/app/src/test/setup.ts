import { installUiTestEnvironment } from '@ssm-usor/spa-runtime/testing/jsdom';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// The default 1 s wait for an element runs out when several suites share the machine, and a
// page that renders in 1.2 s fails as missing. A wait ends as soon as the element appears.
configure({ asyncUtilTimeout: 5_000 });

afterEach(cleanup);

installUiTestEnvironment();

// jsdom has no PDF viewer and does not say so; the browsers the app supports have one.
beforeEach(() => {
  Object.defineProperty(navigator, 'pdfViewerEnabled', { value: true, configurable: true });
});

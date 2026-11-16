import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { SectionNav, SectionNavLink } from './section-nav';

// The routes here are not the app's, which the router's types are registered for.
type Loose = (props: Record<string, unknown>) => ReactNode;
const AnyTab = SectionNavLink as unknown as Loose;

function renderNavs() {
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: () => (
      <>
        <SectionNav label="Tabs">
          <AnyTab to="/a" icon={Circle}>
            Date
          </AnyTab>
        </SectionNav>
        <SectionNav label="Folder" variant="folder">
          <AnyTab to="/a" icon={Circle}>
            Detalii
          </AnyTab>
        </SectionNav>
      </>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  });
  render(<RouterProvider router={router} />);
}

describe('SectionNav', () => {
  it('reserves the bold width of a folder tab label without changing its name', async () => {
    renderNavs();
    const folder = await screen.findByRole('navigation', { name: 'Folder' });
    const tab = within(folder).getByRole('link', { name: 'Detalii' });
    expect(tab.querySelector('[data-label="Detalii"]')).not.toBeNull();

    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    expect(
      within(tabs).getByRole('link', { name: 'Date' }).querySelector('[data-label]')
    ).toBeNull();
  });
});

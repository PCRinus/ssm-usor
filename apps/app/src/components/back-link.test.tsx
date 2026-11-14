import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Circle } from 'lucide-react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { keepOpener, openedHere } from '@/app/opener';

import { BackLink } from './back-link';
import { SectionNav, SectionNavLink } from './section-nav';

// The routes here are not the app's, which the router's types are registered for.
type Loose = (props: Record<string, unknown>) => ReactNode;
const AnyLink = Link as unknown as Loose;
const AnyBackLink = BackLink as unknown as Loose;
const AnyTab = SectionNavLink as unknown as Loose;

function renderRecordAt(path: string) {
  const root = createRootRoute({ component: Outlet });
  const list = createRoute({
    getParentRoute: () => root,
    path: '/list',
    validateSearch: z.object({ q: z.string().optional() }),
    component: function List() {
      return (
        <div data-testid="list">
          <AnyLink to="/record/$id" params={{ id: '7' }} state={openedHere}>
            Record
          </AnyLink>
        </div>
      );
    },
  });
  const other = createRoute({
    getParentRoute: () => root,
    path: '/other',
    component: () => <div data-testid="other" />,
  });
  const record = createRoute({
    getParentRoute: () => root,
    path: '/record/$id',
    component: function Record() {
      return (
        <div>
          <AnyBackLink to="/list" label="Înapoi la listă" />
          <SectionNav label="Tabs">
            <AnyTab to="/record/$id/a" params={{ id: '7' }} icon={Circle}>
              A
            </AnyTab>
            <AnyTab to="/record/$id/b" params={{ id: '7' }} icon={Circle}>
              B
            </AnyTab>
          </SectionNav>
          <Outlet />
        </div>
      );
    },
  });
  const recordIndex = createRoute({
    getParentRoute: () => record,
    path: '/',
    beforeLoad: ({ params }) => {
      throw redirect({
        to: '/record/$id/a' as never,
        params: params as never,
        replace: true,
        state: keepOpener,
      });
    },
  });
  const tabA = createRoute({
    getParentRoute: () => record,
    path: '/a',
    component: () => <div data-testid="tab-a" />,
  });
  const tabB = createRoute({
    getParentRoute: () => record,
    path: '/b',
    component: () => <div data-testid="tab-b" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([list, other, record.addChildren([recordIndex, tabA, tabB])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const back = () => screen.findByTestId('page-back');

describe('back link', () => {
  it('goes to the page above when the record was not opened from another page', async () => {
    const router = renderRecordAt('/other');
    act(() => router.history.push('/record/7/b'));
    const arrow = await back();
    expect(arrow.getAttribute('href')).toBe('/list');
    expect(arrow.getAttribute('aria-label')).toBe('Înapoi la listă');
    expect(arrow.className).toContain('bg-brand-forest/10');
    expect(arrow.className).toContain('size-11');
    expect(arrow.textContent).toBe('');

    await userEvent.click(arrow);
    expect(await screen.findByTestId('list')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/list');
  });

  it('returns to the list it was opened from, search included, after switching tabs', async () => {
    const router = renderRecordAt('/list?q=popescu');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Record' }));
    expect(await screen.findByTestId('tab-a')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'B' }));
    expect(await screen.findByTestId('tab-b')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'A' }));
    expect(await screen.findByTestId('tab-a')).toBeTruthy();

    const arrow = await back();
    expect(arrow.getAttribute('aria-label')).toBe('Înapoi');
    expect(arrow.getAttribute('href')).toBe('/list');
    await user.click(arrow);
    expect(await screen.findByTestId('list')).toBeTruthy();
    expect(router.state.location.href).toBe('/list?q=popescu');
  });

  it('opens the page above on a modified click, without going back', async () => {
    const router = renderRecordAt('/list?q=popescu');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Record' }));
    const arrow = await back();
    await user.keyboard('{Control>}');
    await user.click(arrow);
    await user.keyboard('{/Control}');
    expect(router.state.location.pathname).toBe('/record/7/a');
  });

  it('is never marked as the current page, though it leads to an ancestor of it', async () => {
    const root = createRootRoute({ component: Outlet });
    const parent = createRoute({ getParentRoute: () => root, path: '/parent', component: Outlet });
    const child = createRoute({
      getParentRoute: () => parent,
      path: '/child',
      component: () => <AnyBackLink to="/parent" label="Înapoi la părinte" />,
    });
    const router = createRouter({
      routeTree: root.addChildren([parent.addChildren([child])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    });
    render(<RouterProvider router={router} />);
    const arrow = await back();
    expect(arrow.getAttribute('href')).toBe('/parent');
    expect(arrow.getAttribute('aria-current')).toBeNull();
    expect(arrow.getAttribute('data-status')).toBeNull();
  });
});

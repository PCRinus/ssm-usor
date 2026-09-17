import { TanStackDevtools } from '@tanstack/react-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

// Loaded lazily by the root route in development only; never part of production bundles.
export default function Devtools() {
  return (
    <TanStackDevtools
      config={{ position: 'bottom-right' }}
      plugins={[
        { name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> },
        { name: 'TanStack Query', render: <ReactQueryDevtoolsPanel /> },
      ]}
    />
  );
}

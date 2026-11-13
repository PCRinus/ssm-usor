import { Link } from '@tanstack/react-router';

const tab =
  'inline-flex h-8 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:text-foreground';
const activeTab = 'bg-background text-foreground shadow-sm';

export function LegislationHeader() {
  return (
    <div className="mb-5 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Legislation</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The acts the templates cite, as the daily check reads them on the Portal Legislativ.
          Members read all of it; only you change it here, and each change is in the audit log.
        </p>
      </div>
      <nav
        aria-label="Legislation"
        className="bg-muted inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1"
      >
        <Link
          to="/legislation"
          data-testid="tab-changes"
          className={tab}
          activeOptions={{ exact: true, includeSearch: false }}
          activeProps={{ className: activeTab }}
        >
          Changes
        </Link>
        <Link
          to="/legislation/acts"
          data-testid="tab-acts"
          className={tab}
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: activeTab }}
        >
          Watched acts
        </Link>
        <Link
          to="/legislation/runs"
          data-testid="tab-runs"
          className={tab}
          activeOptions={{ includeSearch: false }}
          activeProps={{ className: activeTab }}
        >
          Runs
        </Link>
      </nav>
    </div>
  );
}

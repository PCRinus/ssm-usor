import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { getListClosedImportsQueryKey } from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { phoneBleed } from '@/components/page-spacing';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { TabSheet } from '@/components/tab-sheet';

import { closedSince, statusesOf } from '../open-imports';
import { useCreditsBalance } from '../use-credits-balance';
import { useMyImports } from '../use-my-imports';
import { importSections } from './import-sections';
import { CreditsLeftLine } from './imports-credits';
import { useClosedTotal } from './use-closed-imports';

// An account that never imported reads its credits in the first import's card instead.
function useNeverImported() {
  const { items } = useMyImports();
  const closedClients = useClosedTotal('client').total;
  const closedEmployees = useClosedTotal('employees').total;
  return items?.length === 0 && closedClients === 0 && closedEmployees === 0;
}

// The closed list is not polled: an import leaves the polled open list when it closes.
function useClosedFollowOpen() {
  const queryClient = useQueryClient();
  const { items } = useMyImports();
  const seen = useRef<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    if (!items) return;
    const previous = seen.current;
    seen.current = statusesOf(items);
    if (previous && closedSince(previous, items)) {
      void queryClient.invalidateQueries({ queryKey: getListClosedImportsQueryKey() });
    }
  }, [items, queryClient]);
}

export function ImportsLayout() {
  const { waiting } = useMyImports();
  useClosedFollowOpen();
  const { balance } = useCreditsBalance();
  const never = useNeverImported();

  return (
    <div data-testid="imports-page">
      <div className="mb-5 grid gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Importuri AI</h1>
          <HelpLink topic="importuri.pagina" label="Ajutor: Importuri AI" />
        </div>
        {balance && !never && <CreditsLeftLine balance={balance} />}
      </div>
      <SectionNav label="Secțiunile paginii Importuri AI" variant="folder" className={phoneBleed}>
        {importSections.map((section) => (
          <SectionNavLink
            key={section.to}
            to={section.to}
            data-testid="imports-section"
            icon={section.icon}
            count={waiting?.[section.kind]}
            countUnit="de verificat"
          >
            {section.label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <TabSheet flush>
        <Outlet />
      </TabSheet>
    </div>
  );
}

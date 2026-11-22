import type { DocumentSet } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

import { PackEmpty } from './pack-empty';
import { PackFolder } from './pack-folder';
import { PackFolders } from './pack-folders';
import { isEmptyPack, openSection } from './pack-labels';
import { PackBar, PackLegend, PackTotal } from './pack-progress';
import type { Pack, PackSection } from './pack-status';

function PackHeader({ pack, actions }: { pack: Pack; actions?: ReactNode }) {
  return (
    <div
      data-testid="pack-header"
      className="grid gap-x-4 gap-y-3.5 px-4 pt-5 pb-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6 sm:pt-6"
    >
      <PackLegend pack={pack} />
      {actions && (
        <div className="flex flex-wrap gap-2 max-sm:order-last max-sm:grid sm:justify-end">
          {actions}
        </div>
      )}
      <div className="flex gap-x-4 gap-y-2 max-sm:flex-col sm:col-span-2 sm:items-center">
        <PackBar counts={pack.counts} className="sm:flex-1" />
        <PackTotal pack={pack} className="shrink-0 text-[0.8125rem]" />
      </div>
    </div>
  );
}

export function PackLayout({
  set,
  clientId,
  pack,
  sectionId,
  readOnly,
  actions,
  generate,
  notices,
  children,
}: {
  set: DocumentSet;
  clientId: string;
  pack: Pack;
  sectionId: string | undefined;
  readOnly: boolean;
  actions?: ReactNode;
  generate?: ReactNode;
  notices?: ReactNode;
  children: (section: PackSection) => ReactNode;
}) {
  const section = openSection(pack, sectionId);
  if (section) {
    return (
      <div data-testid="pack-layout" data-view="folder">
        <PackFolder set={set} clientId={clientId} pack={pack} section={section} notices={notices}>
          {children(section)}
        </PackFolder>
      </div>
    );
  }

  const noticeBlock = (className: string) =>
    notices && <div className={cn('grid gap-4 px-4 sm:px-6', className)}>{notices}</div>;
  return (
    <div data-testid="pack-layout" data-view="overview">
      {isEmptyPack(pack) ? (
        <>
          {noticeBlock('pt-4 sm:pt-6')}
          <PackEmpty set={set} pack={pack} readOnly={readOnly} action={generate} />
        </>
      ) : (
        <>
          <PackHeader pack={pack} actions={actions} />
          {noticeBlock('pb-4')}
        </>
      )}
      <PackFolders set={set} clientId={clientId} pack={pack} />
    </div>
  );
}

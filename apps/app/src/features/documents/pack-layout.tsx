import type { DocumentSet } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

import { documentSetCopy } from './document-sets';
import { PackContents } from './pack-contents';
import { PackEmpty } from './pack-empty';
import { isEmptyPack, shownSection } from './pack-labels';
import { PackBar, PackLegend, PackTotal } from './pack-progress';
import { PackSectionPane } from './pack-section-pane';
import type { Pack, PackSection } from './pack-status';
import { useWideLayout } from './use-wide-layout';

export function PackHeader({
  set,
  pack,
  actions,
}: {
  set: DocumentSet;
  pack?: Pack;
  actions?: ReactNode;
}) {
  const empty = pack !== undefined && isEmptyPack(pack);
  const wide = useWideLayout();
  return (
    <div data-testid="pack-header" className="grid gap-3.5 px-4 pt-5 pb-5 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="text-lg font-semibold tracking-tight">{documentSetCopy[set].heading}</h2>
        {pack && empty && wide && <PackTotal pack={pack} className="text-[0.8125rem]" />}
        {actions && <div className="flex flex-wrap gap-2 max-sm:grid max-sm:w-full">{actions}</div>}
      </div>
      {pack && !empty && (
        <>
          <PackBar counts={pack.counts} />
          <PackLegend pack={pack} />
        </>
      )}
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
  const wide = useWideLayout();
  const noticeBlock = notices ? (
    <div className="grid gap-4 px-4 pb-4 sm:px-6">{notices}</div>
  ) : null;

  if (isEmptyPack(pack)) {
    return (
      <div data-testid="pack-layout" data-layout={wide ? 'wide' : 'narrow'}>
        <PackHeader set={set} pack={pack} actions={actions} />
        {noticeBlock}
        <PackEmpty
          set={set}
          pack={pack}
          readOnly={readOnly}
          layout={wide ? 'wide' : 'narrow'}
          action={generate}
        />
      </div>
    );
  }

  const section = shownSection(pack, sectionId, wide);
  if (!wide && section) {
    return (
      <div data-testid="pack-layout" data-layout="narrow">
        {notices && <div className="grid gap-4 px-4 pt-4">{notices}</div>}
        <PackSectionPane set={set} clientId={clientId} pack={pack} section={section} layout="page">
          {children(section)}
        </PackSectionPane>
      </div>
    );
  }
  return (
    <div data-testid="pack-layout" data-layout={wide ? 'wide' : 'narrow'}>
      <PackHeader set={set} pack={pack} actions={actions} />
      {noticeBlock}
      <div className={cn(wide && 'grid grid-cols-[19rem_minmax(0,1fr)] border-t')}>
        <PackContents
          set={set}
          clientId={clientId}
          pack={pack}
          selected={section}
          layout={wide ? 'pane' : 'list'}
        />
        {wide && section && (
          <PackSectionPane
            set={set}
            clientId={clientId}
            pack={pack}
            section={section}
            layout="pane"
          >
            {children(section)}
          </PackSectionPane>
        )}
      </div>
    </div>
  );
}

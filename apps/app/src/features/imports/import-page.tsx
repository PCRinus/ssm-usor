import type { InstructionDomain } from '@ssm-usor/contracts';

import type { ImportDetail } from '@/api/generated/api';
import { BackLink } from '@/components/back-link';

import { ImportOverviewBack, ImportParentBack } from './import-back';
import { ImportLoader, ProcessingView } from './import-processing-page';
import { ConfirmedImportHub } from './library/confirmed-hub';
import { LibraryTaskPage } from './library/library-task-page';
import { RisksTaskPage } from './library/risks-task-page';
import { ReviewHub } from './review-hub';
import type { SectionId } from './review-model';
import { ReviewSectionPage } from './review-section-page';

const hasLibraryTasks = (detail: ImportDetail) =>
  detail.status === 'confirmed' && detail.libraryParts.length > 0;

export function ImportPage({ importId }: { importId: string }) {
  return (
    <ImportLoader importId={importId} back={<BackLink to="/clienti" label="Înapoi la clienți" />}>
      {(detail) =>
        detail.status === 'ready' && detail.proposal ? (
          <ReviewHub key={detail.id} detail={detail} />
        ) : hasLibraryTasks(detail) ? (
          <ConfirmedImportHub key={detail.id} detail={detail} />
        ) : (
          <ProcessingView detail={detail} back={<ImportParentBack detail={detail} />} />
        )
      }
    </ImportLoader>
  );
}

export function ImportFilesPage({ importId }: { importId: string }) {
  return (
    <ImportLoader importId={importId} back={<ImportOverviewBack importId={importId} />}>
      {(detail) => (
        <ProcessingView
          detail={detail}
          back={
            detail.status === 'ready' || hasLibraryTasks(detail) ? (
              <ImportOverviewBack importId={importId} />
            ) : (
              <ImportParentBack detail={detail} />
            )
          }
        />
      )}
    </ImportLoader>
  );
}

export function ImportSectionPage({ importId, section }: { importId: string; section: SectionId }) {
  return (
    <ImportLoader importId={importId} back={<ImportOverviewBack importId={importId} />}>
      {(detail) =>
        detail.status === 'ready' && detail.proposal ? (
          <ReviewSectionPage key={detail.id} detail={detail} section={section} />
        ) : (
          <ProcessingView detail={detail} back={<ImportOverviewBack importId={importId} />} />
        )
      }
    </ImportLoader>
  );
}

export function ImportLibraryPage({
  importId,
  domain,
}: {
  importId: string;
  domain: InstructionDomain;
}) {
  return (
    <ImportLoader importId={importId} back={<ImportOverviewBack importId={importId} />}>
      {(detail) =>
        (detail.status === 'ready' && detail.proposal) || detail.status === 'confirmed' ? (
          <LibraryTaskPage key={`${detail.id}-${domain}`} detail={detail} domain={domain} />
        ) : (
          <ProcessingView detail={detail} back={<ImportOverviewBack importId={importId} />} />
        )
      }
    </ImportLoader>
  );
}

export function ImportRisksPage({ importId }: { importId: string }) {
  return (
    <ImportLoader importId={importId} back={<ImportOverviewBack importId={importId} />}>
      {(detail) =>
        (detail.status === 'ready' && detail.proposal) || detail.status === 'confirmed' ? (
          <RisksTaskPage key={detail.id} detail={detail} />
        ) : (
          <ProcessingView detail={detail} back={<ImportOverviewBack importId={importId} />} />
        )
      }
    </ImportLoader>
  );
}

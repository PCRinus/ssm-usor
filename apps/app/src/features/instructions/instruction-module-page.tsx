import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { getGetInstructionModuleQueryKey, useGetInstructionModule } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { keepOpener } from '@/app/opener';

import { blocksFromBody, templateBlocks } from './instruction-draft';
import { InstructionEditorPage } from './instruction-editor-page';
import { InstructionForm } from './instruction-form';
import { InstructionModuleDialog } from './instruction-module-dialog';
import { InstructionStartDialog, type StartValues } from './instruction-start-dialog';

function Unavailable({ notFound, onRetry }: { notFound: boolean; onRetry: () => void }) {
  return (
    <div data-testid="editor-unavailable" role="alert" className="grid max-w-lg gap-4 py-10">
      <h1 className="text-2xl font-semibold">Instrucțiunea nu a putut fi deschisă</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {notFound
          ? 'Instrucțiunea nu există în bibliotecă.'
          : 'Nu am putut încărca instrucțiunea. Verifică conexiunea și încearcă din nou.'}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link to="/instructiuni/ssm">Înapoi la instrucțiunile proprii</Link>
        </Button>
        {!notFound && (
          <Button variant="outline" onClick={onRetry}>
            Încearcă din nou
          </Button>
        )}
      </div>
    </div>
  );
}

export function InstructionModulePage({ moduleId }: { moduleId: string }) {
  const { request, key } = useApi();
  const query = useGetInstructionModule(moduleId, {
    request,
    query: { queryKey: key(getGetInstructionModuleQueryKey(moduleId)) },
  });
  const [editing, setEditing] = useState(false);
  // Decided by the first read: a later refetch that fails or finds the module archived must not
  // take the form and its unsaved text away. Saving says so when the module was archived.
  const [openedArchived, setOpenedArchived] = useState<boolean | null>(null);
  if (query.data && openedArchived === null) {
    setOpenedArchived(Boolean(query.data.module.archivedAt));
  }

  if (!query.data) {
    if (!query.isError) return <Skeleton className="h-96 w-full" />;
    return (
      <Unavailable
        notFound={query.error instanceof ApiHttpError && query.error.status === 404}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const { module, body } = query.data;
  if (openedArchived ?? module.archivedAt) {
    return <InstructionEditorPage moduleId={moduleId} />;
  }
  return (
    <>
      <InstructionForm
        key={module.id}
        module={module}
        title={module.title}
        domain={module.domain}
        group={module.group}
        initialBlocks={blocksFromBody(body, module.group)}
        onEditDetails={() => setEditing(true)}
      />
      <InstructionModuleDialog
        editing={editing ? module : null}
        onClose={() => setEditing(false)}
      />
    </>
  );
}

export function NewInstructionPage({ start }: { start: StartValues }) {
  const { request, key } = useApi();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const source = useGetInstructionModule(start.from ?? '', {
    request,
    query: {
      queryKey: key(getGetInstructionModuleQueryKey(start.from ?? '')),
      enabled: Boolean(start.from),
    },
  });
  const [initialBlocks] = useState(() => (start.from ? null : templateBlocks(start.group)));

  if (start.from && !source.data) {
    if (!source.isError) return <Skeleton className="h-96 w-full" />;
    return (
      <Unavailable
        notFound={source.error instanceof ApiHttpError && source.error.status === 404}
        onRetry={() => void source.refetch()}
      />
    );
  }
  const blocks = initialBlocks ?? blocksFromBody(source.data!.body, start.group);

  return (
    <>
      <InstructionForm
        key={start.from ?? 'guided'}
        module={null}
        title={start.title}
        domain={start.domain}
        group={start.group}
        initialBlocks={blocks}
        onEditDetails={() => setEditing(true)}
      />
      <InstructionStartDialog
        open={editing}
        editing
        initial={start}
        onClose={() => setEditing(false)}
        onSubmit={(values) => {
          setEditing(false);
          void navigate({
            to: '/instructiuni/nou',
            search: { ...values, ...(start.from ? { from: start.from } : {}) },
            replace: true,
            state: keepOpener,
          });
        }}
      />
    </>
  );
}

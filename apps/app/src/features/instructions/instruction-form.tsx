import {
  type InstructionDomain,
  type InstructionModuleGroup,
  maxPageSize,
  spacedBody,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useBlocker, useLocation, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ClipboardPaste, Download, Eye, Pencil } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import {
  createInstructionModule,
  downloadInstructionModule,
  getGetInstructionModuleQueryKey,
  getListClientsQueryKey,
  type InstructionModuleResponse,
  saveInstructionBody,
  useListClients,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { keepOpener } from '@/app/opener';
import { BackLink, TitleWithBack } from '@/components/back-link';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { keptFieldNames } from '@/features/reload-prompts/kept-text';
import { commonFailure } from '@/lib/api-errors';
import { saveFile } from '@/lib/save-file';

import { ClientNamedNotice } from './client-named-notice';
import { InstructionBlocks } from './instruction-blocks';
import {
  articleBlock,
  type DraftBlock,
  type DraftBody,
  draftBody,
  sameBody,
} from './instruction-draft';
import { InstructionPreviewDialog, type PreviewRequest } from './instruction-preview-dialog';
import {
  articleCountLabel,
  domainLabels,
  groupLabels,
  invalidateLibrary,
} from './instruction-schema';
import { PasteTextDialog } from './paste-text-dialog';
import { useInstructionBody } from './use-instruction-body';

type SavedModule = InstructionModuleResponse['module'];

const actsByDomain: Record<InstructionDomain, string> = {
  ssm: 'Legea nr. 319/2006 și H.G. nr. 1425/2006',
  su: 'Legea nr. 307/2006 și normele generale aprobate prin O.M.A.I. nr. 163/2007',
};

const clientParams = { page: 1, pageSize: maxPageSize, sort: 'legalName', order: 'asc' } as const;

function saveFailure(cause: unknown) {
  const common = commonFailure(cause);
  if (common) return common;
  const reason = apiErrorReason(cause);
  if (reason === 'instruction_module_title_taken') {
    return 'Biblioteca are deja o instrucțiune cu acest titlu. Schimbă-l din „Titlu, categorie și domeniu”, apoi salvează.';
  }
  if (reason === 'instruction_module_archived') {
    return 'Instrucțiunea a fost arhivată între timp. Reactiveaz-o din bibliotecă ca să o modifici.';
  }
  if (cause instanceof ApiHttpError && cause.status === 404) {
    return 'Instrucțiunea nu mai există în bibliotecă.';
  }
  if (cause instanceof ApiHttpError && cause.status === 409) {
    return 'Instrucțiunea a fost salvată între timp din altă fereastră. Salvează din nou ca să păstrezi textul de aici, sau reîncarcă pagina ca să vezi ce s-a salvat.';
  }
  return 'Nu am putut salva instrucțiunea. Verifică conexiunea și încearcă din nou.';
}

export function InstructionForm({
  module,
  title,
  domain,
  group,
  initialBlocks,
  userId,
  onEditDetails,
}: {
  // Null until the first save creates it.
  module: SavedModule | null;
  title: string;
  domain: InstructionDomain;
  group: InstructionModuleGroup;
  initialBlocks: DraftBlock[];
  userId: string;
  onEditDetails: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const clients = useListClients(clientParams, {
    request: apiRequest,
    query: { queryKey: [...getListClientsQueryKey(clientParams), userId] },
  });
  const clientNames = useMemo(
    () => (clients.data?.items ?? []).map(({ id, legalName }) => ({ id, legalName })),
    [clients.data]
  );
  const {
    blocks,
    setBlocks,
    body,
    articleCount: count,
    namedClients,
    named,
    hasText,
    problem,
    addPasted,
  } = useInstructionBody({
    initialBlocks: () => (initialBlocks.length > 0 ? initialBlocks : [articleBlock()]),
    clients: clientNames,
  });
  const [keepNames] = useState<ReadonlyMap<string, string>>(
    () => new Map(blocks.map((block, index) => [block.id, `instruction-block-${index}`]))
  );
  const page = useLocation({ select: (location) => `${location.pathname}${location.searchStr}` });
  // An empty section hides its boxes, so one that holds kept text opens for it to come back.
  const [openedWithKeptText] = useState<ReadonlySet<string>>(() => {
    const kept = keptFieldNames(page);
    const opened = new Set<string>();
    let heading: string | null = null;
    for (const block of blocks) {
      if (block.kind === 'heading') heading = block.id;
      else if (heading && kept.has(keepNames.get(block.id) ?? '')) opened.add(heading);
    }
    return opened;
  });
  const [baseline, setBaseline] = useState<DraftBody>(() =>
    module ? draftBody(initialBlocks) : { blocks: [] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [preview, setPreview] = useState<PreviewRequest | null>(null);
  const [downloading, setDownloading] = useState(false);
  const leaving = useRef(false);

  const dirty = !sameBody(body, baseline);

  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirty &&
      !leaving.current &&
      current.pathname !== next.pathname &&
      !window.confirm('Ai modificări nesalvate. Părăsești pagina fără să le salvezi?'),
    enableBeforeUnload: () => dirty && !leaving.current,
  });

  async function save() {
    if (saving) return;
    setError(null);
    const found = problem('Scrie cel puțin un articol înainte să salvezi.');
    if (found) {
      setError(found);
      return;
    }
    if (module && !dirty) {
      toast.info('Nimic nou de salvat.');
      return;
    }
    setSaving(true);
    try {
      if (module) {
        const saved = await saveInstructionBody(module.id, body, apiRequest);
        queryClient.setQueryData([...getGetInstructionModuleQueryKey(module.id), userId], {
          module: saved.module,
          body: saved.body,
        });
        setBaseline(spacedBody(saved.body));
        if (saved.changed) {
          toast.success(`Am salvat versiunea ${saved.module.version.number}.`);
        } else {
          toast.info(
            `Textul e același cu cel din versiunea ${saved.module.version.number}: diferă doar spațiile dintre cuvinte, așa că nu am salvat o versiune nouă.`
          );
        }
      } else {
        const created = await createInstructionModule({ title, group, domain, body }, apiRequest);
        leaving.current = true;
        toast.success('Instrucțiunea a fost adăugată în bibliotecă.');
        await navigate({
          to: '/instructiuni/$moduleId',
          params: { moduleId: created.module.id },
          replace: true,
          state: keepOpener,
        });
      }
      await invalidateLibrary(queryClient);
    } catch (cause) {
      leaving.current = false;
      setError(saveFailure(cause));
    } finally {
      setSaving(false);
    }
  }

  const saveShortcut = useEffectEvent(() => void save());
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveShortcut();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function openPreview() {
    setError(null);
    const found = problem('Scrie cel puțin un articol ca să vezi cum se tipărește.');
    if (found) {
      setError(found);
      return;
    }
    setPreview({ title, domain, body });
  }

  async function download() {
    if (!module) return;
    setDownloading(true);
    try {
      const file = await downloadInstructionModule(module.id, undefined, apiRequest);
      saveFile(file, file instanceof File ? file.name : `${title}.docx`);
    } catch {
      setError('Nu am putut descărca instrucțiunea. Verifică conexiunea și încearcă din nou.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div data-testid="instruction-form" className="grid gap-5">
      <div className="grid gap-3">
        <TitleWithBack
          line="text-2xl sm:text-3xl"
          back={
            <BackLink
              to={domain === 'su' ? '/instructiuni/su' : '/instructiuni/ssm'}
              label="Înapoi la instrucțiunile proprii"
            />
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              className="text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl"
              data-testid="instruction-form-title"
            >
              {title}
            </h1>
            <Badge variant={module ? 'default' : 'outline'} data-testid="editor-state">
              {module ? `Versiunea ${module.version.number}` : 'Nouă, nesalvată'}
            </Badge>
            <HelpLink topic="instructiuni.formular" label="Ajutor: scrierea unei instrucțiuni" />
          </div>
        </TitleWithBack>
        <p className="text-sm text-muted-foreground" data-testid="instruction-form-facts">
          {domainLabels[domain]} · {groupLabels[group]} ·{' '}
          {count === 0 ? 'fără articole încă' : articleCountLabel(count).toLowerCase()}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            data-testid="instruction-details"
            onClick={onEditDetails}
          >
            <Pencil aria-hidden="true" />
            Titlu, categorie și domeniu
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="instruction-paste"
            onClick={() => setPasting(true)}
          >
            <ClipboardPaste aria-hidden="true" />
            Lipește text
          </Button>
          <Button
            variant="secondary"
            size="sm"
            data-testid="instruction-preview"
            onClick={openPreview}
          >
            <Eye aria-hidden="true" />
            Previzualizare
          </Button>
          {module && (
            <Button
              variant="secondary"
              size="sm"
              data-testid="editor-download"
              disabled={downloading}
              onClick={() => void download()}
            >
              <Download aria-hidden="true" />
              Descarcă
            </Button>
          )}
        </div>
      </div>

      <ClientNamedNotice named={named} testId="instruction-client-named" />

      {count === 0 && (
        <section
          aria-label="Pornește de la un text existent"
          data-testid="instruction-paste-panel"
          className="grid gap-3 rounded-xl border border-success-border bg-success px-4 py-3.5 text-success-foreground sm:flex sm:items-center sm:gap-4 sm:px-5 sm:py-4"
        >
          <p className="text-sm sm:flex-1">
            <strong className="font-semibold">Ai deja textul într-un document?</strong> Lipește-l și
            îl împărțim în articole, pe secțiuni.
          </p>
          <Button data-testid="instruction-paste-panel-open" onClick={() => setPasting(true)}>
            <ClipboardPaste aria-hidden="true" />
            Lipește text
          </Button>
        </section>
      )}

      <div className="grid gap-3.5">
        <InstructionBlocks
          blocks={blocks}
          category={group}
          namedClients={namedClients}
          keepNames={keepNames}
          openedAtStart={openedWithKeptText}
          onChange={(next) => {
            setBlocks(next);
            setError(null);
          }}
        />
        <p
          className="mt-1.5 rounded-xl border bg-muted/30 px-4 py-3.5 text-sm text-muted-foreground sm:px-5"
          data-testid="instruction-acts"
        >
          După ultimul articol, anexa tipărește singură „Acte normative avute în vedere”:{' '}
          {actsByDomain[domain]}.
        </p>
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p
          className="text-sm text-muted-foreground"
          role="status"
          data-testid="instruction-save-state"
        >
          {count === 0
            ? 'Scrie cel puțin un articol ca să o poți salva.'
            : !module
              ? 'Se adaugă în bibliotecă la prima salvare.'
              : dirty
                ? 'Modificări nesalvate.'
                : 'Toate modificările sunt salvate.'}
        </p>
        <Button
          data-testid="editor-save"
          className="ml-auto"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? 'Se salvează…' : 'Salvează'}
        </Button>
        {error && (
          <Notice variant="destructive" data-testid="instruction-form-error" className="basis-full">
            {error}
          </Notice>
        )}
      </div>

      <PasteTextDialog
        open={pasting}
        title={title}
        category={group}
        hasText={hasText}
        onClose={() => setPasting(false)}
        onAdd={(added, mode) => {
          addPasted(added, mode);
          setError(null);
        }}
      />
      <InstructionPreviewDialog request={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

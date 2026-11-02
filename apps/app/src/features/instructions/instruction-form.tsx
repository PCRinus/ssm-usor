import {
  articleCount,
  instructionBodySchema,
  type InstructionDomain,
  type InstructionModuleGroup,
  maxPageSize,
  spacedBody,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useBlocker, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ClipboardPaste, Download, Eye, Pencil } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  createInstructionModule,
  downloadInstructionModule,
  getGetInstructionModuleQueryKey,
  getListClientsQueryKey,
  type InstructionModuleResponse,
  saveInstructionBody,
  useListClients,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { saveFile } from '@/lib/save-file';

import { InstructionBlocks } from './instruction-blocks';
import {
  articleBlock,
  articleNumbers,
  type ClientName,
  clientPatterns,
  clientsNamedIn,
  type DraftBlock,
  type DraftBody,
  draftBody,
  endSentence,
  isEmptyArticle,
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

type SavedModule = InstructionModuleResponse['module'];

const actsByDomain: Record<InstructionDomain, string> = {
  ssm: 'Legea nr. 319/2006 și H.G. nr. 1425/2006',
  psi: 'Legea nr. 307/2006 și normele generale aprobate prin O.M.A.I. nr. 163/2007',
};

const clientParams = { page: 1, pageSize: maxPageSize, sort: 'legalName', order: 'asc' } as const;

function bodyProblem(body: DraftBody) {
  if (articleCount(body) === 0) return 'Scrie cel puțin un articol înainte să salvezi.';
  const parsed = instructionBodySchema.safeParse(body);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue?.code === 'custom'
    ? issue.message
    : 'Un titlu de secțiune are cel mult 300 de caractere, iar un paragraf cel mult 20.000.';
}

function saveFailure(cause: unknown) {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'instruction_module_title_taken') {
    return 'Biblioteca are deja o instrucțiune cu acest titlu. Schimbă-l din „Titlu, categorie și domeniu”, apoi salvează.';
  }
  if (body?.reason === 'instruction_module_archived') {
    return 'Instrucțiunea a fost arhivată între timp. Reactiveaz-o din bibliotecă ca să o modifici.';
  }
  if (cause instanceof ApiHttpError && cause.status === 404) {
    return 'Instrucțiunea nu mai există în bibliotecă.';
  }
  if (cause instanceof ApiHttpError && cause.status === 409) {
    return 'Instrucțiunea a fost salvată între timp din altă fereastră. Salvează din nou ca să păstrezi textul de aici, sau reîncarcă pagina ca să vezi ce s-a salvat.';
  }
  if (cause instanceof ApiHttpError && cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
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
  const [blocks, setBlocks] = useState<DraftBlock[]>(() =>
    initialBlocks.length > 0 ? initialBlocks : [articleBlock()]
  );
  const [baseline, setBaseline] = useState<DraftBody>(() =>
    module ? draftBody(initialBlocks) : { blocks: [] }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [preview, setPreview] = useState<PreviewRequest | null>(null);
  const [downloading, setDownloading] = useState(false);
  const leaving = useRef(false);

  const body = useMemo(() => draftBody(blocks), [blocks]);
  const dirty = !sameBody(body, baseline);
  const count = articleNumbers(blocks).size;

  const clients = useListClients(clientParams, {
    request: apiRequest,
    query: { queryKey: [...getListClientsQueryKey(clientParams), userId] },
  });
  const patterns = useMemo(
    () =>
      clientPatterns((clients.data?.items ?? []).map(({ id, legalName }) => ({ id, legalName }))),
    [clients.data]
  );
  const { namedClients, named } = useMemo(() => {
    const perBlock = new Map<string, ClientName[]>();
    const all = new Map<string, ClientName>();
    if (patterns.length > 0) {
      for (const block of blocks) {
        const found = clientsNamedIn(block.text, patterns);
        if (found.length === 0) continue;
        perBlock.set(block.id, found);
        for (const client of found) all.set(client.id, client);
      }
    }
    return { namedClients: perBlock, named: [...all.values()] };
  }, [blocks, patterns]);

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
    const problem = bodyProblem(body);
    if (problem) {
      setError(problem);
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
          to: '/instructions/$moduleId',
          params: { moduleId: created.module.id },
          replace: true,
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
    const problem = bodyProblem(body);
    if (problem) {
      setError(
        problem.startsWith('Scrie cel puțin')
          ? 'Scrie cel puțin un articol ca să vezi cum se tipărește.'
          : problem
      );
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

  const hasText = blocks.some((block) =>
    block.kind === 'article'
      ? !isEmptyArticle(block)
      : block.section === null && block.text.trim() !== ''
  );

  return (
    <div data-testid="instruction-form" className="grid gap-5">
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="instruction-form-title">
            {title}
          </h1>
          <Badge variant={module ? 'default' : 'outline'} data-testid="editor-state">
            {module ? `Versiunea ${module.version.number}` : 'Nouă, nesalvată'}
          </Badge>
          <HelpLink topic="instructiuni.formular" label="Ajutor: scrierea unei instrucțiuni" />
        </div>
        <p className="text-sm text-muted-foreground" data-testid="instruction-form-facts">
          {domainLabels[domain]} · {groupLabels[group]} · {articleCountLabel(count).toLowerCase()}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="instruction-details"
            onClick={onEditDetails}
          >
            <Pencil aria-hidden="true" />
            Titlu, categorie și domeniu
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="instruction-paste"
            onClick={() => setPasting(true)}
          >
            <ClipboardPaste aria-hidden="true" />
            Lipește text
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="instruction-preview"
            onClick={openPreview}
          >
            <Eye aria-hidden="true" />
            Previzualizare
          </Button>
          {module && (
            <Button
              variant="outline"
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
        <p className="max-w-3xl text-sm text-muted-foreground">
          Fiecare articol se numerotează după locul lui; titlurile de secțiune nu se numără. Textul
          gri e doar un îndemn: nu se salvează și nu se tipărește, iar o secțiune lăsată goală nu
          apare în anexă.
        </p>
      </div>

      {named.length > 0 && (
        <Notice variant="warning" data-testid="instruction-client-named">
          <ul className="grid gap-1">
            {named.map((client) => (
              <li key={client.id}>
                Textul numește clientul {endSentence(client.legalName)} Instrucțiunea se aplică și
                altor clienți.
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <InstructionBlocks
          blocks={blocks}
          category={group}
          namedClients={namedClients}
          onChange={(next) => {
            setBlocks(next);
            setError(null);
          }}
        />
        <p
          className="mt-6 border-t pt-4 text-sm text-muted-foreground"
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
          {!module
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
          setBlocks(
            mode === 'replace'
              ? added
              : [...blocks.filter((block) => !isEmptyArticle(block)), ...added]
          );
          setError(null);
        }}
      />
      <InstructionPreviewDialog request={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

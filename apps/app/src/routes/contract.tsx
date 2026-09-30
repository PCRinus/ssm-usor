import { Button } from '@ssm-usor/ui/components/button';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useRouteContext } from '@tanstack/react-router';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import {
  type ApiErrorResponse,
  type ContractReturnResponse,
  downloadContractReturn,
  lookupContractReturn,
  useUploadContractReturn,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { PublicFrame } from '@/app/public-frame';
import { Notice } from '@/components/notice';
import { formatRoDate } from '@/lib/dates';
import { fileAddress } from '@/lib/save-file';

// Public: the return link in a contract email lands here (ADR 007, amended). The person has
// no account; the token in the address is all that identifies the send, and it goes to the
// API in request bodies.
export const Route = createFileRoute('/contract')({
  staticData: { title: 'Exemplarul semnat' },
  validateSearch: z.object({ token: z.string().optional() }),
  component: ContractReturnPage,
});

const Frame = (props: { title: string; description?: ReactNode; children?: ReactNode }) => (
  <PublicFrame testId="contract-return-page" {...props} />
);

const contractLine = (contract: ContractReturnResponse) =>
  `contractul nr. ${contract.contractNumber} din ${formatRoDate(contract.contractDate)}`;

function WriteTo({ contract }: { contract: ContractReturnResponse }) {
  if (!contract.contactEmail) return null;
  return (
    <>
      {' '}
      Pentru întrebări scrieți la{' '}
      <a className="underline" href={`mailto:${contract.contactEmail}`}>
        {contract.contactEmail}
      </a>
      .
    </>
  );
}

function ContractReturnPage() {
  const { token } = Route.useSearch();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const lookup = useQuery({
    queryKey: ['contract-return', token],
    queryFn: ({ signal }) => lookupContractReturn({ token: token! }, { ...apiRequest, signal }),
    enabled: Boolean(token && apiRequest.baseUrl),
    retry: false,
    staleTime: Infinity,
  });

  if (!token || (lookup.error instanceof ApiHttpError && lookup.error.status === 404)) {
    return (
      <Frame
        title="Linkul nu este valid"
        description="Adresa este incompletă sau nu mai există. Deschideți linkul din emailul primit, sau scrieți persoanei care v-a trimis contractul."
      />
    );
  }
  if (lookup.isError || !apiRequest.baseUrl) {
    return (
      <Frame
        title="Nu am putut încărca contractul"
        description="Verificați conexiunea și încercați din nou."
      >
        <Button
          variant="outline"
          disabled={lookup.isFetching}
          onClick={() => void lookup.refetch()}
        >
          Încercați din nou
        </Button>
      </Frame>
    );
  }
  if (lookup.isPending) {
    return (
      <Frame title="Se încarcă contractul…">
        <p role="status" className="sr-only">
          Se încarcă contractul…
        </p>
      </Frame>
    );
  }

  const contract = lookup.data;
  if (contract.status === 'confirmed') {
    return (
      <Frame
        title="Exemplarul semnat a fost confirmat"
        description={
          <>
            {contract.organizationName} a primit și a confirmat exemplarul semnat pentru{' '}
            {contractLine(contract)}. Nu mai este nimic de făcut.
            <WriteTo contract={contract} />
          </>
        }
      />
    );
  }
  if (contract.status === 'superseded') {
    return (
      <Frame
        title="Contractul a fost modificat între timp"
        description={
          <>
            {contract.organizationName} a emis o versiune nouă pentru {contractLine(contract)}, așa
            că acest link nu mai primește exemplare. Veți primi un email cu noua versiune.
            <WriteTo contract={contract} />
          </>
        }
      />
    );
  }
  if (contract.status === 'expired') {
    return (
      <Frame
        title="Linkul nu mai este valabil"
        description={
          <>
            Linkul pentru {contractLine(contract)} a fost valabil 60 de zile.
            <WriteTo contract={contract} />
          </>
        }
      />
    );
  }
  return (
    <ReturnForm
      token={token}
      contract={contract}
      onChanged={() => void lookup.refetch()}
      onDone={() => void lookup.refetch()}
    />
  );
}

function uploadMessage(cause: unknown) {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'return_link_too_many_uploads') {
    return 'Acest link a primit deja prea multe fișiere. Scrieți persoanei care v-a trimis contractul.';
  }
  if (cause instanceof ApiHttpError && cause.status === 400) {
    return 'Fișierul trebuie să fie un PDF de cel mult 15 MB. Dacă aveți o fotografie a contractului, salvați-o ca PDF.';
  }
  return 'Nu am putut trimite fișierul. Verificați conexiunea și încercați din nou.';
}

function ReturnForm({
  token,
  contract,
  onChanged,
  onDone,
}: {
  token: string;
  contract: ContractReturnResponse;
  /** The link closed meanwhile: the page reads it again. */
  onChanged: () => void;
  onDone: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const upload = useUploadContractReturn({ request: apiRequest });
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // A real link, ready before the tap: the in-app browser of Gmail on Android (a Firefox custom
  // tab) cannot download at all, but shows a PDF in its viewer, which can save it. The token
  // stays in request bodies (ADR 003), so the link is a signed one, renewed before it expires.
  const link = useQuery({
    queryKey: ['contract-return-link', token],
    queryFn: ({ signal }) => downloadContractReturn({ token }, { ...apiRequest, signal }),
    retry: false,
    refetchInterval: (query) =>
      Math.max((query.state.data?.expiresInSeconds ?? 600) - 60, 30) * 1_000,
  });
  const closed = link.error instanceof ApiHttpError && link.error.status === 409;
  const reportedClosed = useRef(false);
  useEffect(() => {
    if (!closed || reportedClosed.current) return;
    reportedClosed.current = true;
    onChanged();
  }, [closed, onChanged]);

  // A phone that slept may keep a link past its expiry before the renewal runs.
  async function openFresh(event: MouseEvent<HTMLAnchorElement>) {
    const lifetime = (link.data?.expiresInSeconds ?? 600) * 1_000;
    if (Date.now() - link.dataUpdatedAt < lifetime - 30_000) return;
    event.preventDefault();
    const { data } = await link.refetch();
    if (data) window.location.assign(fileAddress(apiRequest.baseUrl, data, 'inline'));
  }

  async function send() {
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync({ data: { token, file } });
      setDone(true);
      onDone();
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 409) {
        const body = cause.body as Partial<ApiErrorResponse>;
        if (body.reason === 'return_link_closed') return onChanged();
      }
      setError(uploadMessage(cause));
    }
  }

  if (done) {
    return (
      <Frame
        title="Mulțumim, exemplarul a ajuns"
        description={
          <span data-testid="return-done">
            {contract.organizationName} a primit exemplarul semnat pentru {contractLine(contract)}{' '}
            și îl va confirma. Puteți închide această pagină.
            <WriteTo contract={contract} />
          </span>
        }
      />
    );
  }

  return (
    <Frame
      title="Contract de prestări servicii"
      description={
        <>
          <strong className="text-foreground">{contract.organizationName}</strong> v-a trimis{' '}
          {contractLine(contract)}, încheiat cu{' '}
          <strong className="text-foreground">{contract.clientName}</strong>.
        </>
      }
    >
      {contract.receivedAt && (
        <Notice variant="info" data-testid="return-received">
          Un exemplar a ajuns pe {formatRoDate(contract.receivedAt.slice(0, 10))}. Îl puteți înlocui
          până când {contract.organizationName} îl confirmă.
        </Notice>
      )}
      <ol className="grid gap-5 text-sm leading-relaxed">
        <li className="grid gap-2">
          <p>
            <span className="font-semibold">1. Deschideți contractul</span>, același fișier ca în
            email. Îl salvați din vizualizatorul de PDF al browserului.
          </p>
          <div>
            {link.data ? (
              <Button asChild variant="outline">
                <a
                  data-testid="return-download"
                  href={fileAddress(apiRequest.baseUrl, link.data, 'inline')}
                  onClick={(event) => void openFresh(event)}
                >
                  Deschideți PDF-ul
                </a>
              </Button>
            ) : link.isError && !closed ? (
              <Button
                variant="outline"
                data-testid="return-download-retry"
                onClick={() => void link.refetch()}
              >
                Nu am putut pregăti PDF-ul. Încercați din nou
              </Button>
            ) : (
              <Button variant="outline" disabled data-testid="return-download-pending">
                Se pregătește PDF-ul…
              </Button>
            )}
          </div>
        </li>
        <li>
          <span className="font-semibold">2. Semnați-l</span>: electronic, cu certificatul calificat
          al firmei, sau pe hârtie, apoi scanat.
        </li>
        <li className="grid gap-3">
          <p>
            <span className="font-semibold">3. Trimiteți exemplarul semnat</span>, un singur PDF de
            cel mult 15 MB.
          </p>
          <input
            ref={fileInput}
            type="file"
            data-testid="return-file"
            accept=".pdf,application/pdf"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            disabled={upload.isPending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <div>
            <Button
              data-testid="return-upload"
              disabled={!file || upload.isPending}
              onClick={() => void send()}
            >
              {upload.isPending ? 'Se trimite…' : 'Trimiteți exemplarul semnat'}
            </Button>
          </div>
        </li>
      </ol>
      {error && (
        <Notice variant="destructive" data-testid="return-error">
          {error}
        </Notice>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Fișierul este păstrat în SSM Ușor ca exemplar semnat al contractului și îl vede doar{' '}
        {contract.organizationName}.{' '}
        <a
          className="underline"
          href="https://ssmusor.ro/confidentialitate/"
          target="_blank"
          rel="noreferrer"
        >
          Politica de confidențialitate
        </a>
        .
      </p>
    </Frame>
  );
}

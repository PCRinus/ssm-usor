import type { InstructionDomain } from '@ssm-usor/contracts';
import { Alert, AlertDescription, AlertTitle } from '@ssm-usor/ui/components/alert';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';

import { markEarlierInstructionsUnavailable } from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';

import {
  askedOnClientPage,
  instructionsName,
  namesOf,
  useEarlierInstructions,
  useRefreshEarlierInstructions,
} from './earlier-instructions';
import { EarlierInstructionsDialog } from './earlier-instructions-dialog';

const titleId = 'earlier-instructions-notice-title';

export function EarlierInstructionsNotice({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const state = useEarlierInstructions(clientId, userId, !readOnly);
  const refresh = useRefreshEarlierInstructions(clientId);
  const [adding, setAdding] = useState<InstructionDomain | null>(null);
  const [answering, setAnswering] = useState(false);
  const missing = askedOnClientPage(state.data?.domains ?? []).map((domain) => domain.domain);

  async function answer(domains: InstructionDomain[]) {
    setAnswering(true);
    try {
      await Promise.all(
        domains.map((domain) => markEarlierInstructionsUnavailable(clientId, domain, apiRequest))
      );
      toast.success(
        domains.length > 1
          ? 'Am notat că clientul nu are instrucțiunile proprii anterioare.'
          : `Am notat că clientul nu are ${instructionsName[domains[0]!]} anterioare.`
      );
    } catch {
      toast.error('Nu am putut salva răspunsul. Verifică conexiunea și încearcă din nou.');
    }
    await refresh();
    setAnswering(false);
  }

  return (
    <>
      {!readOnly && missing.length > 0 && (
        <Alert
          variant="info"
          role="status"
          aria-labelledby={titleId}
          data-testid="earlier-instructions-notice"
        >
          <Info aria-hidden="true" />
          <AlertTitle id={titleId}>Instrucțiunile proprii anterioare, opțional</AlertTitle>
          <AlertDescription className="mt-1 justify-items-stretch gap-3">
            <p className="max-w-[84ch]">
              Instruirile preluate de pe hârtie trimit la articole din instrucțiunile proprii pe
              care clientul le avea atunci ({namesOf(missing)}). Păstrate aici, arată ce s-a predat,
              la un control sau la cercetarea unui accident. Nu e o obligație legală.{' '}
              <HelpLink topic="angajati.instructiuni-anterioare" className="text-current">
                Află mai mult
              </HelpLink>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                data-testid="earlier-instructions-add"
                onClick={() => setAdding(missing[0]!)}
              >
                Adaugă instrucțiunile
              </Button>
              {missing.length === 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="earlier-instructions-none"
                  disabled={answering}
                  aria-label={`Nu le am: clientul nu are ${instructionsName[missing[0]!]} anterioare`}
                  onClick={() => void answer(missing)}
                >
                  Nu le am
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="earlier-instructions-none"
                      disabled={answering}
                    >
                      Nu le am
                      <ChevronDown aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {missing.map((domain) => (
                      <DropdownMenuItem
                        key={domain}
                        data-testid="earlier-instructions-none-domain"
                        onSelect={() => void answer([domain])}
                      >
                        Nu am {instructionsName[domain]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem
                      data-testid="earlier-instructions-none-all"
                      onSelect={() => void answer(missing)}
                    >
                      Nu le am pe niciunele
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      <EarlierInstructionsDialog
        clientId={clientId}
        domain={adding}
        onClose={() => setAdding(null)}
      />
    </>
  );
}

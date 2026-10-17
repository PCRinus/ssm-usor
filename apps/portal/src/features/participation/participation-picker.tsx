import { useNavigate } from '@tanstack/react-router';
import { Building2, ChevronRight } from 'lucide-react';

import { participationKindLabels, useParticipations } from './participation-context';

export function ParticipationPicker() {
  const { participations, participation: current, choose } = useParticipations();
  const navigate = useNavigate();

  return (
    <main data-testid="participation-picker" className="grid gap-6 py-10">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Alege compania</h1>
        <p className="leading-relaxed text-muted-foreground">
          Contul tău are acces la mai multe companii. Alege-o pe cea pe care vrei să o deschizi; o
          poți schimba oricând din Contul meu.
        </p>
      </div>
      <ul className="grid gap-3">
        {participations.map((item) => (
          <li key={item.participantId}>
            <button
              type="button"
              data-testid="participation-option"
              aria-current={item.participantId === current?.participantId ? 'true' : undefined}
              className="flex min-h-16 w-full items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left shadow-xs transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=true]:border-primary"
              onClick={() => {
                choose(item.participantId);
                void navigate({ to: '/', replace: true });
              }}
            >
              <Building2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium break-words">{item.clientName}</span>
                <span className="text-sm text-muted-foreground">
                  {participationKindLabels[item.kind]} · {item.organizationName}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

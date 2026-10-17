import { useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { Building2, ChevronRight } from 'lucide-react';

import { PublicFrame } from '@/app/public-frame';
import { ParticipantLanguageSwitch } from '@/features/language/language-switch';
import { participationKindMessages } from '@/lib/labels';

import { useParticipations } from './participation-context';

export function ParticipationPicker() {
  const { t, i18n } = useLingui();
  const { participations, participation: current, choose } = useParticipations();
  const navigate = useNavigate();

  return (
    <PublicFrame
      testId="participation-picker"
      languageSwitch={current ? <ParticipantLanguageSwitch participation={current} /> : undefined}
      title={t`Alege clientul`}
      description={t`Contul tău are acces la mai mulți clienți ai prestatorului SSM. Alege-l pe cel pe care vrei să îl deschizi; îl poți schimba oricând din contul tău.`}
    >
      <ul className="grid gap-3">
        {participations.map((item) => (
          <li key={item.participantId}>
            <button
              type="button"
              data-testid="participation-option"
              aria-current={item.participantId === current?.participantId ? 'true' : undefined}
              className="flex min-h-16 w-full items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=true]:border-primary"
              onClick={() => {
                choose(item.participantId);
                void navigate({ to: '/', replace: true });
              }}
            >
              <Building2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="font-medium break-words">{item.clientName}</span>
                <span className="text-sm text-muted-foreground">
                  {i18n._(participationKindMessages[item.kind])}
                </span>
                <span className="text-sm break-words text-muted-foreground">
                  {t`Prestator SSM: ${item.organizationName}`}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </PublicFrame>
  );
}

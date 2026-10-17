import { useLingui } from '@lingui/react/macro';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

import {
  getGetPortalMeQueryKey,
  type PortalMeResponse,
  useSetPortalLanguage,
} from '@/api/generated/api';
import { activateLocale, type Locale } from '@/app/i18n';
import type { Participation } from '@/features/participation/participation-context';
import { useApiRequest } from '@/lib/request';

import { chooseDeviceLocale, rememberDeviceLocale } from './locale';

// Each language is named in itself, so a reader finds theirs whichever one is showing.
const options: { locale: Locale; short: string; name: string }[] = [
  { locale: 'ro', short: 'RO', name: 'Română' },
  { locale: 'en', short: 'EN', name: 'English' },
];

export function LanguageSwitch({
  onChoose,
  className,
}: {
  onChoose: (locale: Locale) => void;
  className?: string;
}) {
  const { t, i18n } = useLingui();
  return (
    <div
      role="group"
      aria-label={t`Limba`}
      data-testid="language-switch"
      className={cn('inline-flex shrink-0 rounded-full border bg-card p-0.5', className)}
    >
      {options.map(({ locale, short, name }) => {
        const active = i18n.locale === locale;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-label={name}
            aria-pressed={active}
            data-testid={`language-${locale}`}
            onClick={() => {
              if (!active) onChoose(locale);
            }}
            className="h-11 min-w-12 rounded-full px-3 text-sm font-semibold tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-brand-forest aria-pressed:text-brand-cream"
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}

export function DeviceLanguageSwitch({ className }: { className?: string }) {
  return <LanguageSwitch onChoose={chooseDeviceLocale} className={className} />;
}

export function ParticipantLanguageSwitch({
  participation,
  className,
}: {
  participation: Participation;
  className?: string;
}) {
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const save = useSetPortalLanguage({ request: apiRequest });

  function choose(language: Locale) {
    const key = getGetPortalMeQueryKey();
    const previous = queryClient.getQueryData<PortalMeResponse>(key);
    rememberDeviceLocale(language);
    queryClient.setQueryData<PortalMeResponse>(key, (me) =>
      me
        ? {
            participations: me.participations.map((item) =>
              item.participantId === participation.participantId ? { ...item, language } : item
            ),
          }
        : me
    );
    activateLocale(language);
    save.mutate(
      { participantId: participation.participantId, data: { language } },
      { onError: () => queryClient.setQueryData(key, previous) }
    );
  }

  return <LanguageSwitch onChoose={choose} className={className} />;
}

import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { useEffect, useMemo, useState } from 'react';

import { newPasswordField } from '../auth/password-schema';

const strengthLabels = ['Foarte slabă', 'Slabă', 'Acceptabilă', 'Bună', 'Puternică'] as const;

let estimatorPromise: Promise<ZxcvbnFactory> | undefined;

function loadEstimator() {
  estimatorPromise ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]).then(
    ([{ ZxcvbnFactory }, common, english]) =>
      new ZxcvbnFactory({
        dictionary: { ...common.dictionary, ...english.dictionary },
        graphs: common.adjacencyGraphs,
        translations: english.translations,
      })
  );
  return estimatorPromise;
}

export function PasswordStrengthIndicator({
  id,
  password,
  email,
}: {
  id: string;
  password: string;
  email: string;
}) {
  const [estimator, setEstimator] = useState<ZxcvbnFactory | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!password || estimator || loadFailed) return;
    let active = true;
    void loadEstimator().then(
      (loaded) => {
        if (active) setEstimator(loaded);
      },
      () => {
        if (active) setLoadFailed(true);
      }
    );
    return () => {
      active = false;
    };
  }, [password, estimator, loadFailed]);

  const score = useMemo(
    () => (password && estimator ? estimator.check(password, email ? [email] : []).score : null),
    [password, email, estimator]
  );

  const label = !password
    ? 'Necompletată'
    : loadFailed
      ? 'Indisponibilă'
      : score === null
        ? 'Se evaluează…'
        : strengthLabels[score];
  const meetsRules = newPasswordField.safeParse(password).success;
  const color =
    score === null
      ? 'bg-muted-foreground'
      : score === 0
        ? 'bg-destructive'
        : score <= 2
          ? 'bg-amber-500'
          : 'bg-primary';

  return (
    <div id={id} data-testid={id} className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">Puterea parolei</span>
        <span className="font-medium" data-testid={`${id}-label`} role="status" aria-live="polite">
          {label}
        </span>
      </div>
      <Progress
        value={score === null ? 0 : (score + 1) * 20}
        aria-label="Puterea parolei"
        aria-valuetext={label}
        className="h-1.5 bg-muted"
        indicatorClassName={color}
      />
      <p className={cn('text-xs', meetsRules ? 'text-primary' : 'text-muted-foreground')}>
        {!password
          ? 'Introdu o parolă.'
          : loadFailed
            ? 'Verifică cerințele de mai jos.'
            : meetsRules
              ? 'Parola respectă cerințele minime.'
              : 'Mai sunt cerințe de îndeplinit.'}
      </p>
    </div>
  );
}

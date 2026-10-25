import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import type { ReactNode } from 'react';

import { HelpLink } from './help-link';

export function FormSection({
  title,
  description,
  help,
  children,
}: {
  title: string;
  description?: string;
  help?: HelpTopic;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 px-6 py-7 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10">
      <div>
        <div className="flex items-center gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {help && <HelpLink topic={help} label={`Ajutor: ${title}`} />}
        </div>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]">{children}</div>
    </section>
  );
}

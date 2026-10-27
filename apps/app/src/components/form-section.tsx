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
        {/* Inline, so the help link follows the title's last word when the title wraps. */}
        <div className="whitespace-nowrap">
          <h2 className="inline text-base font-semibold whitespace-normal">{title}</h2>
          {help && (
            <HelpLink topic={help} label={`Ajutor: ${title}`} className="ml-1 align-middle" />
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]">{children}</div>
    </section>
  );
}

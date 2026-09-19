import type { ReactNode } from 'react';

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 px-6 py-7 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]">{children}</div>
    </section>
  );
}

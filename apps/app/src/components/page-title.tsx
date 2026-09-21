import { useMatches } from '@tanstack/react-router';
import { useEffect } from 'react';

import { loaderCrumb } from './route-title';

export function PageTitle() {
  const title = useMatches({
    select: (matches) => {
      const status = matches.at(-1)?.status;
      if (status === 'notFound') return 'Pagina nu a fost găsită — SSM Ușor';
      if (status === 'error') return 'Pagina nu a putut fi încărcată — SSM Ușor';

      const labels = matches.flatMap((match) => {
        const crumb = loaderCrumb(match.loaderData);
        const label = crumb ?? match.staticData.title;
        return label ? [{ label, isEntity: Boolean(crumb) }] : [];
      });
      const page = labels.at(-1);
      if (!page) return 'SSM Ușor';

      const parents = labels.slice(0, -1);
      const context = parents.filter((item) => item.isEntity).at(-1) ?? parents.at(-1);
      return [
        page.label,
        ...(context && context.label !== page.label ? [context.label] : []),
        'SSM Ușor',
      ].join(' — ');
    },
  });

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

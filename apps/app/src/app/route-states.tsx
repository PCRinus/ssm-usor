import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';

import { PublicFrame, PublicFrameAction } from './public-frame';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Pagina nu a fost găsită — SSM Ușor';
  }, []);

  return (
    <PublicFrame
      testId="not-found-page"
      title="Pagina nu a fost găsită"
      description="Adresa nu există sau pagina a fost mutată. Verifică linkul sau pornește de la început."
    >
      <PublicFrameAction asChild>
        <Link to="/">Înapoi la început</Link>
      </PublicFrameAction>
    </PublicFrame>
  );
}

export function RouteErrorPage() {
  return (
    <PublicFrame
      testId="route-error-page"
      title="Pagina nu a putut fi încărcată"
      description="Verifică conexiunea și încearcă din nou."
    >
      <PublicFrameAction onClick={() => window.location.reload()}>
        Încearcă din nou
      </PublicFrameAction>
    </PublicFrame>
  );
}

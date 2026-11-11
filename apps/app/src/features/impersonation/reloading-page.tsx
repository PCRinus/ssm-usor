import { PublicFrame, PublicFrameAction } from '@/app/public-frame';

export function ReloadingPage({ onReload }: { onReload: () => void }) {
  return (
    <PublicFrame
      testId="identity-reloading"
      title="Se reîncarcă…"
      description="Membrul ca care acționezi s-a schimbat sau acțiunea s-a încheiat, așa că pagina se deschide din nou, cu datele potrivite."
    >
      <PublicFrameAction data-testid="identity-reload" onClick={onReload}>
        Reîncarcă pagina
      </PublicFrameAction>
    </PublicFrame>
  );
}

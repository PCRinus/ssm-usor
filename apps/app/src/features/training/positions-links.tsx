import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';

export function PositionsLink({ clientId }: { clientId: string }) {
  return (
    <Link
      to="/clienti/$clientId/posturi"
      params={{ clientId }}
      className="underline underline-offset-4"
    >
      Posturi de lucru
    </Link>
  );
}

export function PositionsButton({ clientId }: { clientId: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/clienti/$clientId/posturi" params={{ clientId }}>
        Deschide Posturi de lucru
      </Link>
    </Button>
  );
}

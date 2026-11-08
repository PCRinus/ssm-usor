import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Search } from 'lucide-react';

export function AnafLookupButton({
  loading,
  disabled,
  onClick,
  testId,
  primary = false,
  again = false,
  className,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
  primary?: boolean;
  again?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={primary ? 'default' : 'outline'}
      className={cn('h-11', className)}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      <Search aria-hidden="true" />
      {loading ? 'Se caută…' : again ? 'Caută din nou' : 'Caută la ANAF'}
    </Button>
  );
}

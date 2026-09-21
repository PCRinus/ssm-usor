import { Button } from '@ssm-usor/ui/components/button';
import { Search } from 'lucide-react';

export function AnafLookupButton({
  loading,
  disabled,
  onClick,
  testId,
}: {
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      <Search aria-hidden="true" />
      {loading ? 'Se caută…' : 'Caută la ANAF'}
    </Button>
  );
}

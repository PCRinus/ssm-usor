import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

export function PasswordInput({
  id,
  className,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type' | 'id'> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        className={`h-11 pr-12 ${className ?? ''}`}
        type={visible ? 'text' : 'password'}
        disabled={disabled}
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 size-11 text-muted-foreground hover:bg-transparent hover:text-foreground"
        aria-label={visible ? 'Ascunde parola' : 'Arată parola'}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  );
}

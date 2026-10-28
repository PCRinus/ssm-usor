import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { type FormEvent, type ReactNode, useState } from 'react';

import { Field } from '@/components/form-field';

export type ItemDialogField = {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'reference' | 'checkbox' | 'roles';
  required?: boolean;
  options?: { value: string; label: string }[];
};

type Value = string | number | boolean | null | string[];

function initial(field: ItemDialogField, value: unknown): Value {
  if (field.kind === 'reference') {
    if (value && typeof value === 'object') return (value as { id: string | null }).id ?? '';
    return typeof value === 'string' ? value : '';
  }
  if (field.kind === 'checkbox') return Boolean(value);
  if (field.kind === 'roles') return Array.isArray(value) ? (value as string[]) : [];
  return value === null || value === undefined ? '' : String(value);
}

function output(field: ItemDialogField, value: Value): Value {
  if (field.kind === 'checkbox' || field.kind === 'roles') return value;
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (field.kind === 'number') return Number(text);
  return text;
}

// The app's dialogs for people, fire-safety means and equipment save rows at once and ask for
// fields no import reads; an item of a proposal is a draft, so it gets this plain form.
export function ItemEditDialog({
  title,
  fields,
  values,
  aside,
  onSave,
  onClose,
}: {
  title: string;
  fields: ItemDialogField[];
  values: Record<string, unknown>;
  aside?: ReactNode;
  onSave: (values: Record<string, Value>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, Value>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, initial(field, values[field.name])]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    for (const field of fields) {
      const value = output(field, draft[field.name] ?? null);
      if (field.required && (value === null || (Array.isArray(value) && value.length === 0))) {
        found[field.name] = `Completează ${field.label.toLowerCase()}.`;
      }
      if (field.kind === 'number' && value !== null && !Number.isInteger(value)) {
        found[field.name] = 'Scrie un număr întreg.';
      }
      if (field.kind === 'roles' && Array.isArray(value) && value.length === 0) {
        found[field.name] = 'Alege cel puțin un rol.';
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSave(
      Object.fromEntries(
        fields.map((field) => [field.name, output(field, draft[field.name] ?? null)])
      )
    );
    onClose();
  }

  const set = (name: string, value: Value) =>
    setDraft((current) => ({ ...current, [name]: value }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="review-item-dialog"
        className="sm:max-w-xl"
        aria-describedby={undefined}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="mt-5 grid gap-5 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `review-item-${field.name}`;
              const error = errors[field.name]
                ? { type: 'manual', message: errors[field.name] }
                : undefined;
              const value = draft[field.name];
              const wide =
                field.kind === 'text' || field.kind === 'roles' || field.kind === 'reference';
              if (field.kind === 'checkbox') {
                return (
                  <label key={field.name} className="flex items-center gap-2 text-sm sm:col-span-2">
                    <Checkbox
                      id={id}
                      checked={value === true}
                      onCheckedChange={(checked) => set(field.name, checked === true)}
                    />
                    {field.label}
                  </label>
                );
              }
              if (field.kind === 'roles') {
                const chosen = (value as string[]) ?? [];
                return (
                  <fieldset key={field.name} className="grid gap-2 sm:col-span-2">
                    <legend className="mb-1 text-sm font-medium">{field.label}</legend>
                    {field.options?.map((option) => (
                      <label key={option.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={chosen.includes(option.value)}
                          onCheckedChange={(checked) =>
                            set(
                              field.name,
                              checked === true
                                ? [...chosen, option.value]
                                : chosen.filter((role) => role !== option.value)
                            )
                          }
                        />
                        {option.label}
                      </label>
                    ))}
                    {errors[field.name] && (
                      <p role="alert" className="text-sm text-destructive">
                        {errors[field.name]}
                      </p>
                    )}
                  </fieldset>
                );
              }
              return (
                <Field
                  key={field.name}
                  id={id}
                  label={field.label}
                  mark={field.required ? 'required' : 'optional'}
                  error={error}
                  className={wide ? 'sm:col-span-2' : undefined}
                >
                  {field.kind === 'select' || field.kind === 'reference' ? (
                    <NativeSelect
                      id={id}
                      data-testid={id}
                      className="w-full"
                      value={String(value ?? '')}
                      aria-invalid={Boolean(error)}
                      onChange={(event) => set(field.name, event.target.value)}
                    >
                      {field.kind === 'reference' &&
                        !field.options?.some((option) => option.value === '') && (
                          <NativeSelectOption value="">Alege…</NativeSelectOption>
                        )}
                      {field.options?.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  ) : (
                    <Input
                      id={id}
                      data-testid={id}
                      type={field.kind === 'date' ? 'date' : 'text'}
                      inputMode={field.kind === 'number' ? 'numeric' : undefined}
                      value={String(value ?? '')}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                      onChange={(event) => set(field.name, event.target.value)}
                    />
                  )}
                </Field>
              );
            })}
            {aside}
          </DialogBody>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" data-testid="review-item-save">
              Salvează
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

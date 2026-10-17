import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { optionalPhoneField } from '@/lib/phone';

import { Field } from './form-field';
import { PhoneInput } from './phone-input';

const schema = z.object({ phone: optionalPhoneField });
type Values = z.infer<typeof schema>;

function PhoneForm({ phone = '', onSave }: { phone?: string; onSave: (values: Values) => void }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { phone } });
  const error = form.formState.errors.phone;
  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSave)(event)}>
      <Field id="phone" label="Telefon" error={error}>
        <Controller
          control={form.control}
          name="phone"
          render={({ field }) => (
            <PhoneInput
              id="phone"
              data-testid="phone"
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'phone-error' : undefined}
            />
          )}
        />
      </Field>
      <button type="submit">Salvează</button>
    </form>
  );
}

function mount(phone?: string) {
  const saved: Values[] = [];
  render(<PhoneForm phone={phone} onSave={(values) => saved.push(values)} />);
  return { saved, user: userEvent.setup() };
}

const nationalInput = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Telefon' });
const countrySelect = () =>
  screen.getByRole<HTMLSelectElement>('combobox', { name: 'Țara numărului de telefon' });
const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Salvează' }));

describe('PhoneInput', () => {
  it('starts in Romania and formats a Romanian number as it is typed', async () => {
    const { saved, user } = mount();
    expect(countrySelect().value).toBe('RO');
    expect(nationalInput().getAttribute('inputmode')).toBe('tel');
    expect(nationalInput().getAttribute('autocomplete')).toBe('tel-national');
    await user.type(nationalInput(), '0721000000');
    expect(nationalInput().value).toBe('0721 000 000');
    await save(user);
    expect(saved).toEqual([{ phone: '+40721000000' }]);
  });

  it('lists Romania first, then the countries foreign workers most often come from', () => {
    mount();
    const labels = [...countrySelect().options].map((option) => option.textContent);
    expect(labels.slice(0, 3)).toEqual([
      'România (+40)',
      'Republica Moldova (+373)',
      'Ucraina (+380)',
    ]);
    expect(labels).toContain('Nepal (+977)');
  });

  it('reads the number in the country chosen', async () => {
    const { saved, user } = mount();
    await user.selectOptions(countrySelect(), 'IT');
    await user.type(nationalInput(), '3331234567');
    expect(nationalInput().value).toBe('333 123 4567');
    await save(user);
    expect(saved).toEqual([{ phone: '+393331234567' }]);
  });

  it('keeps the digits when the country changes after typing', async () => {
    const { saved, user } = mount();
    await user.type(nationalInput(), '069123456');
    await user.selectOptions(countrySelect(), 'MD');
    await save(user);
    expect(saved).toEqual([{ phone: '+37369123456' }]);
  });

  it('takes the country from a number typed with its code', async () => {
    const { saved, user } = mount();
    await user.type(nationalInput(), '+380671234567');
    expect(countrySelect().value).toBe('UA');
    expect(nationalInput().value).toBe('067 123 4567');
    await save(user);
    expect(saved).toEqual([{ phone: '+380671234567' }]);
  });

  it('shows a stored foreign number in its own country', () => {
    mount('+9779841234567');
    expect(countrySelect().value).toBe('NP');
    expect(nationalInput().value).toBe('984-1234567');
  });

  it('refuses a number that is not valid for the country chosen', async () => {
    const { saved, user } = mount();
    await user.selectOptions(countrySelect(), 'GB');
    await user.type(nationalInput(), '0721 000');
    await save(user);
    expect((await screen.findByTestId('phone-error')).textContent).toBe(
      'Numărul de telefon nu este valid pentru țara aleasă.'
    );
    expect(nationalInput().getAttribute('aria-invalid')).toBe('true');
    expect(saved).toEqual([]);
  });

  it('leaves an untouched field empty', async () => {
    const { saved, user } = mount();
    await save(user);
    expect(saved).toEqual([{ phone: '' }]);
  });
});

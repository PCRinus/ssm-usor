import { Input } from '@ssm-usor/ui/components/input';
import {
  AsYouType,
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js/min';
import { ChevronDownIcon } from 'lucide-react';
import { type ChangeEvent, type ComponentProps, type FocusEvent, useState } from 'react';

const likelyCountries: readonly CountryCode[] = [
  'RO',
  'MD',
  'UA',
  'IT',
  'ES',
  'DE',
  'GB',
  'FR',
  'HU',
  'BG',
  'TR',
  'NP',
  'LK',
  'IN',
  'BD',
  'PK',
  'PH',
  'VN',
];

type CountryOption = { country: CountryCode; label: string };

let options: { likely: CountryOption[]; rest: CountryOption[] } | undefined;

function countryOptions() {
  if (options) return options;
  const names = new Intl.DisplayNames(['ro'], { type: 'region' });
  const option = (country: CountryCode) => ({
    country,
    label: `${names.of(country) ?? country} (+${getCountryCallingCode(country)})`,
  });
  options = {
    likely: likelyCountries.map(option),
    rest: getCountries()
      .filter((country) => !likelyCountries.includes(country))
      .map(option)
      .sort((a, b) => a.label.localeCompare(b.label, 'ro')),
  };
  return options;
}

type PhoneState = { value: string; country: CountryCode; text: string };

function readValue(value: string, country: CountryCode): PhoneState {
  const phone = value ? parsePhoneNumberFromString(value, { defaultCountry: country }) : undefined;
  if (phone?.isValid() && phone.country) {
    return { value, country: phone.country, text: phone.formatNational() };
  }
  return { value, country, text: value };
}

function readTyped(typed: string, country: CountryCode, formatNow: boolean): PhoneState {
  const trimmed = typed.trim();
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    const international = `+${trimmed.replace(/^(\+|00)/, '').replace(/\D/g, '')}`;
    const phone = parsePhoneNumberFromString(international);
    if (phone?.isValid() && phone.country) {
      return { value: phone.number, country: phone.country, text: phone.formatNational() };
    }
    return { value: international, country, text: typed };
  }
  const formatter = new AsYouType(country);
  const formatted = formatter.input(typed);
  const digits = typed.replace(/\D/g, '');
  const value =
    formatter.getNumberValue() ?? (digits ? `+${getCountryCallingCode(country)}${digits}` : '');
  return { value, country, text: formatNow ? formatted : typed };
}

/**
 * One E.164 string in and out (empty when nothing is typed), so a form keeps a single field; a
 * number that is not valid yet still comes out with its country's code, for the form to refuse.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  'data-testid': testId,
  ...props
}: Omit<ComponentProps<typeof Input>, 'id' | 'value' | 'onChange' | 'type'> & {
  id: string;
  value: string;
  onChange: (value: string) => void;
  'data-testid'?: string;
}) {
  const [state, setState] = useState(() => readValue(value, 'RO'));
  let current = state;
  if (value !== state.value) {
    current = readValue(value, state.country);
    setState(current);
  }
  const { likely, rest } = countryOptions();

  function commit(next: PhoneState) {
    setState(next);
    if (next.value !== current.value) onChange(next.value);
  }

  function changeText(event: ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value.replace(/[^0-9+\s().-]/g, '');
    // Formatting while the caret sits inside the number, or while deleting, would move the caret
    // or put back the separator just deleted; the number is formatted again on blur.
    const inputType = (event.nativeEvent as InputEvent).inputType ?? '';
    const atEnd = event.target.selectionStart === event.target.value.length;
    commit(readTyped(typed, current.country, atEnd && !inputType.startsWith('delete')));
  }

  function changeCountry(event: ChangeEvent<HTMLSelectElement>) {
    commit(readTyped(current.text, event.target.value as CountryCode, true));
  }

  function blur(event: FocusEvent<HTMLInputElement>) {
    const phone = parsePhoneNumberFromString(current.value);
    if (phone?.isValid() && phone.country === current.country) {
      setState({ ...current, text: phone.formatNational() });
    }
    onBlur?.(event);
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <div className="relative flex h-11 items-center gap-1.5 rounded-md border border-input bg-transparent pr-8 pl-3 text-base shadow-xs transition-[color,box-shadow] has-[select:disabled]:opacity-50 has-[select:focus-visible]:border-ring has-[select:focus-visible]:ring-[3px] has-[select:focus-visible]:ring-ring/50 md:text-sm dark:bg-input/30">
        <span aria-hidden="true" className="tabular-nums">
          <span className="text-muted-foreground">{current.country}</span> +
          {getCountryCallingCode(current.country)}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground opacity-50"
        />
        <select
          id={`${id}-country`}
          data-testid={testId ? `${testId}-country` : undefined}
          aria-label="Țara numărului de telefon"
          className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
          value={current.country}
          disabled={disabled}
          onChange={changeCountry}
        >
          <optgroup label="Frecvente">
            {likely.map((option) => (
              <option key={option.country} value={option.country}>
                {option.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Toate țările">
            {rest.map((option) => (
              <option key={option.country} value={option.country}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <Input
        id={id}
        data-testid={testId}
        type="text"
        inputMode="tel"
        autoComplete="tel-national"
        className="h-11"
        value={current.text}
        disabled={disabled}
        onChange={changeText}
        onBlur={blur}
        {...props}
      />
    </div>
  );
}

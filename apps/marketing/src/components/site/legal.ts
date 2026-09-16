/**
 * Identity of the entity that operates ssmusor.ro. Used by /termeni and /confidentialitate.
 *
 * Fill the fields and set `filled: true` before publishing; until then the pages highlight
 * these values and show a note that they are placeholders. Works for a PFA (registry number
 * F__/____/____) as well as an SRL (J__/____/____).
 */
export const legalEntity = {
  filled: false,
  name: '[Denumirea entității]',
  address: '[adresa sediului]',
  registry: '[F__/____/____ sau J__/____/____]',
  cui: '[________]',
  city: '[localitatea sediului]',
  signatureProvider: '[prestatorul de servicii de încredere]',
  emailProvider: '[furnizorul de email]',
};

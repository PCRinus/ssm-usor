/**
 * Identity of the entity that operates ssmusor.ro. Used by /termeni and /confidentialitate.
 *
 * While `filled` is false the pages highlight these values and show a note that they are
 * placeholders. Optional fields left empty are omitted from the text.
 */
export const legalEntity = {
  filled: true,
  name: 'Casapu Mircea-Adrian PFA',
  /** Registrul Comerțului number (F… for a PFA, J… for an SRL). */
  registry: 'F2026037073000',
  cui: 'RO55293439',
  /** Optional registered address. Empty omits the "cu sediul în" clause. */
  address: '',
  /** Optional city for the jurisdiction clause. Empty falls back to the operator's seat. */
  city: '',
  /** Named once chosen; until then, honest fallback wording. */
  signatureProvider:
    'un prestator calificat de servicii de încredere, comunicat la deschiderea contului',
  emailProvider: 'un furnizor de email tranzacțional, comunicat la deschiderea contului',
};

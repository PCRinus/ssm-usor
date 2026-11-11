# ADR 035: SU instead of PSI, in the interface and in the code, and Romanian addresses in the app

- Status: accepted
- Date: 2026-11-02

## Context

The interface names the fire-safety field **PSI** (_prevenirea și stingerea incendiilor_): _Documente PSI_, _Instruire PSI_, _Teste PSI_, _Mijloace PSI_. The glossary chose it on purpose and listed SU as the word to avoid ([ADR 016](adr-016-fire-safety-documents.md)). PSI is the name of the field before Legea 307/2006 on _apărarea împotriva incendiilor_. The authority is the _Inspectoratul General pentru Situații de Urgență_. The documents the app generates already say SU or write the field out: the own instructions are IPSU, the training themes and the individual sheet are _în domeniul situațiilor de urgență_ (OMAI 712/2005). Mircea decided on 2026-11-02 that the interface follows the documents.

The code carries the old word too. The instruction, training and test domain is `psi` beside `ssm`, with columns such as `psi_due_on` and `psi_training_state`, and the domain is part of the address of the IPSU library (`/instructions/psi`), the test bank and an employee's training tab.

The app's addresses mix two languages: `/clients/$clientId/job-positions` beside `/actualizari` and `/legislatie`. The portal's and the help site's are Romanian.

There are no customers and production holds test data only, so nothing needs to keep working across the change: no redirects from old addresses, no compatibility in the API.

## Decision

### SU in the interface, PSI in one name

The field is **SU** wherever the interface names it: _Documente SU_, _Documentație SU_, _Instruire SU_, _Teste SU_, _Instrucțiuni SU_, _Registre și formulare SU_, _Alte documente SU_, the _fișa individuală de instructaj SU_. Where a sentence reads better with the field written out, it says _în domeniul situațiilor de urgență_ or, for what concerns fire alone, _apărarea împotriva incendiilor_.

**PSI** stays in **cadru tehnic PSI** only. It is the occupation's name (COR 541902, _cadru tehnic cu atribuții în domeniul prevenirii și stingerii incendiilor_), the authorized courses certify it under that name, and _cadru tehnic SU_ is not an occupation. The decision appointing them keeps its title, _Decizia privind cadrul tehnic PSI_, and writes the duties out in its text as today.

The tab of the fire-safety means becomes **Mijloace de apărare**, from the law's _mijloace tehnice de apărare împotriva incendiilor_ (Legea 307/2006) and the title of section 5 of the set. _Mijloace SU_ is not said by practitioners, and the tab also keeps the building and the substances, so _Mijloace de stingere_ would be too narrow.

The norms are named by their title: _Normele generale de apărare împotriva incendiilor_ (OMAI 163/2007), never _Normele generale PSI_.

The import still recognizes PSI in a provider's files: their packs say both.

Updates already published keep the words they were written with.

### `su` in the code

The domain value `psi` becomes `su` everywhere: the database enum and the columns, functions and views that carry it, the API's contracts, and the code's names (`psi_due_on` becomes `su_due_on`, `psiAnnexData` becomes `suAnnexData`). It is done by a forward migration; the test data is not kept specially.

The English names stay **fire-safety** and **fire** (`fire_decision_technician`, `fire-safety-means`). The set's content is fire defence, and "emergency" would read as first aid or evacuation in English.

### Romanian addresses

Every address of the app is Romanian, written without diacritics. The page files under `apps/app/src/routes` follow, as the router reads addresses from them; the code around them stays English. The domain in an address is `ssm` or `su`. The API's paths, search parameters and the sign-in provider's return address (`/auth/callback`, set in its configuration) stay as they are: no one reads them. Nothing redirects from an old address, and the routes that only forwarded older addresses (a client's `edit`, `contact`, `document-data` and `other-documents/contract`) go.

| Before                                                     | After                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| `/login`                                                   | `/autentificare`                                             |
| `/register`                                                | `/inregistrare`                                              |
| `/forgot-password`                                         | `/parola-uitata`                                             |
| `/reset-password`                                          | `/resetare-parola`                                           |
| `/confirm-email`                                           | `/confirmare-email`                                          |
| `/accept-invitation`                                       | `/invitatie`                                                 |
| `/onboarding`                                              | `/configurare`                                               |
| `/dashboard`                                               | `/dashboard` (the label is the word)                         |
| `/leads`, `/new`, `/$leadId/edit`                          | `/oferte`, `/nou`, `/$leadId/editare`                        |
| `/clients`, `/new`                                         | `/clienti`, `/nou`                                           |
| `/clients/$clientId/details`                               | `/clienti/$clientId/detalii`                                 |
| `…/contract/edit`                                          | `…/contract/editare`                                         |
| `…/documents`                                              | `…/documente-ssm`                                            |
| `…/fire-safety-documents`                                  | `…/documente-su`                                             |
| `…/fire-safety-means`                                      | `…/mijloace-de-aparare`                                      |
| `…/employees`, `/new`, `/$employeeId/edit`                 | `…/angajati`, `/nou`, `/$employeeId/editare`                 |
| `…/employees/$employeeId/training/ssm`, `/psi`             | `…/angajati/$employeeId/instruire/ssm`, `/su`                |
| `…/job-positions`                                          | `…/posturi`                                                  |
| `…/job-positions/$jobPositionId/risk-evaluation`           | `…/posturi/$jobPositionId/evaluare-riscuri`                  |
| `…/job-positions/risk-evaluations/$evaluationId`           | `…/posturi/evaluari-riscuri/$evaluationId`                   |
| `…/other-documents`                                        | `…/alte-documente`                                           |
| `…/training`                                               | `…/instruire`                                                |
| `…/trainings`                                              | `…/instruiri-tinute`                                         |
| `/clients/import/$importId/files`, `/instructions/$domain` | `/clienti/import/$importId/fisiere`, `/instructiuni/$domain` |
| `/employees`                                               | `/angajati`                                                  |
| `/instructions`, `/ssm`, `/psi`, `/new`                    | `/instructiuni`, `/ssm`, `/su`, `/nou`                       |
| `/tests`, `/ssm`, `/psi`                                   | `/teste`, `/ssm`, `/su`                                      |
| `/risks`                                                   | `/riscuri`                                                   |
| `/signatures`                                              | `/semnaturi`                                                 |
| `/organization`, `/team`, `/company`, `/authorizations`    | `/organizatie`, `/echipa`, `/date-firma`, `/abilitari`       |
| `/organization/subscription`, `/choose`                    | `/organizatie/abonament`, `/alege`                           |
| `/profile`                                                 | `/profil`                                                    |

Addresses already Romanian stay: `/actualizari`, `/legislatie` and its tabs, `/setari`, `/contract`, `…/portal`, `…/import/…`.

### Order

Three pull requests, stacked: the domain value in the code, then the words of the interface, the help articles and the documents, then the addresses.

## Consequences

- The glossary and ADR 016's choice of PSI are amended; the older ADRs keep PSI where they recorded what was built then.
- A provider used to "PSI" reads SU across the app. The release's update says so once.
- Links in emails sent before the change stop working. There are no customers to receive them.
- Code that names the domain in an address reads `su`, so there is no mapping between the address and the domain value.

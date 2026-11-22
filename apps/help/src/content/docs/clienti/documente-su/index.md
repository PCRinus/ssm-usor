---
title: Documentația SU
description: Dosarele documentației SU a unui client, numerele documentelor, documentele cerute de la 10 lucrători și raportul anual pe ani.
sources:
  - docs/architecture/adr-016-fire-safety-documents.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - packages/contracts/src/documents.ts
  - apps/app/src/features/documents/document-sections.ts
  - apps/app/src/features/documents/document-labels.ts
  - apps/app/src/features/documents/documents-card.tsx
  - apps/app/src/features/documents/pack-layout.tsx
  - apps/app/src/features/documents/pack-folders.tsx
  - apps/app/src/features/documents/pack-folder.tsx
---

Tabul **Documentație SU** ține documentele de situații de urgență ale clientului: deciziile, instrucțiunile proprii, tematica, testele, lista mijloacelor de apărare, registrele și documentele pentru inspectorat. Se folosește ca **Documentație SSM**: aceleași dosare, aceleași stări ale documentelor, aceeași generare și descărcare, descrise în [Documentația SSM](/clienti/documente-ssm/). Aici sunt doar diferențele.

## Secțiunile și numerele

Fiecare secțiune este un dosar, iar fiecare document are numărul lui din dosarul tipărit, scris înaintea titlului. Coperta unei secțiuni are numărul **X.0**.

| Secțiune                                                   | Documente                                                                                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Decizii interne                                         | 1.0 coperta, 1.1–1.9 deciziile                                                                                                                              |
| 2. Instrucțiuni proprii în domeniul situațiilor de urgență | 2.0 coperta, 2.1 instrucțiunile proprii, cu anexele                                                                                                         |
| 3. Tematica de instruire                                   | 3.0 coperta, 3.1 tematica                                                                                                                                   |
| 4. Teste de verificare a cunoștințelor                     | 4.0 coperta, 4.1 testul la angajare, 4.2 testul anual                                                                                                       |
| 5. Mijloace de apărare și organizarea la locul de muncă    | 5.1 lista mijloacelor, 5.2 organizarea la locul de muncă, 5.3 lista substanțelor periculoase, 5.4 graficele de întreținere și verificare                    |
| 6. Registre și formulare SU                                | 6.0 coperta, 6.1 evidența exercițiilor, controalelor și permiselor, 6.2 permisul de lucru cu foc, 6.3 registrul instalațiilor, 6.4 registrul stingătoarelor |
| 7. Documente pentru inspectorat                            | 7.1 fișa obiectivului, 7.2 raportul anual de evaluare                                                                                                       |

Secțiunile 5 și 7 nu au copertă, așa că încep de la 5.1 și 7.1.

## Documentele cerute de la 10 lucrători

Ordinul MAI nr. 163/2007, art. 20, dă unui operator cu mai puțin de 10 salariați o listă mai scurtă de acte și evidențe. Șase documente ale setului sunt cerute doar de art. 17 și art. 18, așa că un client cu mai puțin de 10 lucrători în listă nu le primește:

- 1.8 decizia privind perioadele caniculare și sezonul rece;
- 1.9 decizia privind controlul propriu;
- 5.4 graficele de întreținere și verificare;
- 6.3 registrul de control pentru instalațiile de apărare împotriva incendiilor;
- 7.1 fișa obiectivului;
- 7.2 raportul anual de evaluare.

Acestea nu apar deloc în dosare și nici în numărători. Un document dintre ele care a fost generat rămâne în documentație, chiar dacă numărul de lucrători scade sub 10. Fereastra de generare spune ce înseamnă numărul de lucrători al clientului.

## Raportul anual pe ani

Raportul anual de evaluare se face pentru un an. La generare alegi anul de referință; alt an face un document nou, alături de cel de anul trecut, nu o revizie a lui. În dosarul 7 apare raportul celui mai nou an, iar sub el **Anii anteriori** deschide rapoartele de dinainte, fiecare cu meniul lui.

La un client cu cel puțin 10 lucrători, când toate celelalte documente există, butonul de generare devine **Generează pentru alt an**.

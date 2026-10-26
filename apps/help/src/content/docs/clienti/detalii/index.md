---
title: Detalii
description: Tabul Detalii al clientului, card cu card, cu datele firmei, reprezentantul legal, persoana de contact și notițele, și documentele care le folosesc.
topics:
  - id: detalii.date-firma
    heading: Datele firmei
  - id: detalii.reprezentant-legal
    heading: Reprezentantul legal
  - id: detalii.nume-reprezentant
    heading: Numele și prenumele
  - id: detalii.functia-reprezentantului
    heading: Funcția
  - id: detalii.reprezentant-angajat
    heading: Administratorul este și angajat al firmei
  - id: detalii.persoana-de-contact
    heading: Persoana de contact
  - id: detalii.contact-email
    heading: Emailul
  - id: detalii.contact-telefon
    heading: Telefonul
  - id: detalii.notite
    heading: Notițele
  - id: detalii.date-lipsa
    heading: Când documentele cer date de aici
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-007-leads-and-service-contracts.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - packages/contracts/src/clients.ts
  - packages/contracts/src/document-data.ts
  - packages/contracts/src/documents.ts
  - packages/contracts/src/signatures.ts
  - apps/api/src/modules/document-data/handlers.ts
  - apps/api/src/modules/documents/site-sheet.ts
  - apps/api/src/modules/service-contracts/context.ts
  - apps/app/src/routes/_authenticated/clients/$clientId/details.tsx
  - apps/app/src/features/clients/company-card.tsx
  - apps/app/src/features/clients/legal-representative-card.tsx
  - apps/app/src/features/clients/contact-card.tsx
  - apps/app/src/features/clients/owner-notes-card.tsx
  - apps/app/src/features/clients/client-form-schema.ts
  - apps/app/src/features/training/document-details-schema.ts
  - apps/app/src/features/missing-data/missing-rows.ts
  - supabase/migrations/20261022100000_legal_representative_employee.sql
---

**Detalii** e primul tab al clientului și ține ce știi despre firmă: datele ei, reprezentantul legal, sediul și punctele de lucru, persoana de contact și, pentru administratori, notițele. Fiecare card se modifică separat: **Modifică** deschide pe loc câmpurile lui, iar pe un card gol butonul se numește **Adaugă**.

Pe un client arhivat cardurile se pot doar citi (vezi [Un client arhivat](/clienti/#un-client-arhivat)).

## Datele firmei

Cardul **Date firmă** arată denumirea, CUI-ul, numărul din Registrul Comerțului, codul CAEN cu denumirea activității și adresa sediului social. Câmpurile lor, căutarea la ANAF și regulile lor sunt explicate în [Adăugarea și modificarea unui client](/clienti/adaugare-si-modificare/#identificare).

## Reprezentantul legal

Persoana care reprezintă legal firma, de obicei administratorul. Numele și funcția lui se tipăresc în deciziile generate, în alte documente din seturile SSM și PSI, cum e fișa obiectivului, și în actul adițional privind semnarea electronică.

Cât timp lipsește numele sau funcția, seturile de documente SSM și PSI nu se pot genera, iar angajații nu pot primi actul adițional în portal. Contractul de prestări servicii le cere și el.

### Numele și prenumele

Așa cum vrei să apară în documente, de exemplu „Ion Popescu”: documentele îl tipăresc exact cum îl scrii. Între 2 și 160 de caractere.

### Funcția

Funcția lui în firmă, de exemplu „Administrator” sau „Director general”. Între 2 și 80 de caractere.

### Administratorul este și angajat al firmei

Bifează căsuța când reprezentantul legal e și pe lista de angajați a clientului, ca la o firmă cu un singur om, unde administratorul e și angajat. Apoi alege-l din listă la **Angajatul**.

Cu legătura făcută, documentele îl numesc o singură dată, nu o dată ca administrator și încă o dată ca angajat. Tot după ea aplicația îl deosebește pe administrator de angajați, de exemplu când verifică dacă reprezentantul lucrătorilor nu e chiar reprezentantul legal.

Fără legătură, aplicația compară numele, fără să țină cont de litere mari, diacritice sau ordinea cuvintelor. Comparația poate să încurce doi oameni cu același nume, așa că fă legătura când reprezentantul e și angajat.

Ca să-ți fie mai ușor:

- când bifezi căsuța și un singur angajat are numele scris la **Nume și prenume**, aplicația îl alege singură;
- când alegi angajatul și numele e încă gol, aplicația îl completează din numele angajatului.

„Alege angajatul din listă sau debifează căsuța.” apare când ai bifat căsuța, dar nu ai ales niciun angajat.

## Persoana de contact

Omul cu care vorbești la client. Poate fi altcineva decât reprezentantul legal. Toate câmpurile sunt opționale: **Nume**, între 2 și 160 de caractere, **Email** și **Telefon**.

Fișa obiectivului din setul PSI tipărește telefonul și emailul ca date de contact ale firmei. Dacă persoana de contact e chiar reprezentantul legal, cu același nume, fișa tipărește telefonul și ca telefon de serviciu al administratorului. Contractul de prestări servicii tipărește telefonul.

Persoana de contact nu are acces în portal. Angajații intră în portal cu emailul și telefonul lor, din pagina fiecăruia.

### Emailul

O adresă de email validă, cel mult 254 de caractere. Altfel vezi „Introdu o adresă de email validă.”

### Telefonul

Scrie-l cum vrei să apară pe documente, de exemplu „0721 000 000”. Aplicația nu verifică numărul, doar îi cere între 5 și 20 de caractere; altfel vezi „Telefonul are cel puțin 5 caractere.”

## Notițele

Cardul **Notițe** îl văd doar administratorii organizației. Aici ții discuțiile, prețurile și pașii următori cu clientul, în cel mult 5000 de caractere. Notițele nu apar în niciun document și nici în portal.

Salvezi cu **Salvează notițele**. Până atunci vezi „Modificări nesalvate”. Un client care a fost întâi client potențial își păstrează notițele de atunci.

## Când documentele cer date de aici

Când generezi documentele, lista datelor lipsă te trimite aici pentru:

- „Numele reprezentantului legal” și „Funcția reprezentantului legal”, la documentele SSM și PSI;
- „Datele PSI ale locurilor de muncă”, la documentele PSI (vezi [Datele PSI](/clienti/detalii/puncte-de-lucru/#datele-psi));
- numărul din Registrul Comerțului, adresa sediului și reprezentantul legal, la contractul de prestări servicii.

Linkul deschide cardul cu câmpul de completat. După salvare, mesajul de confirmare îți oferă **Înapoi la generare** sau **Înapoi la contract**, ca să revii de unde ai plecat.

Despre sediu și punctele de lucru, vezi [Sediul și punctele de lucru](/clienti/detalii/puncte-de-lucru/).

---
title: Clienți
description: Lista clienților, ce arată coloanele ei, pagina unui client, și arhivarea și reactivarea unui client.
topics:
  - id: clienti.lista
    heading: Lista clienților
  - id: clienti.activi-si-arhivati
    heading: Clienți activi și clienți arhivați
  - id: clienti.documentatie
    heading: Documentația SSM și PSI
  - id: clienti.pagina-clientului
    heading: Pagina unui client
  - id: clienti.arhivare
    heading: Arhivarea unui client
  - id: clienti.client-arhivat
    heading: Un client arhivat
  - id: clienti.reactivare
    heading: Reactivarea unui client
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-007-leads-and-service-contracts.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-020-fire-safety-from-ten-employees.md
  - packages/contracts/src/clients.ts
  - apps/api/src/modules/clients/handlers.ts
  - apps/api/src/modules/documents/context.ts
  - apps/app/src/routes/_authenticated/clients/index.tsx
  - apps/app/src/features/clients/client-columns.tsx
  - apps/app/src/features/clients/documentation-badge.tsx
  - apps/app/src/features/clients/client-layout.tsx
  - apps/app/src/features/clients/client-archive-dialog.tsx
  - supabase/migrations/20260921110000_archived_client_freeze.sql
  - supabase/migrations/20261010150000_client_list_fire_safety.sql
---

Un client e o firmă pentru care lucrezi. Pe pagina lui ții tot ce îi privește: datele firmei, angajații, posturile, mijloacele PSI, instruirile și documentele SSM și PSI. Adaugi un client din **Clienți**, cu **Adaugă client**; ce cere formularul găsești în [Adăugarea și modificarea unui client](/clienti/adaugare-si-modificare/).

## Lista clienților

**Clienți** din meniul lateral arată clienții organizației tale. Fiecare rând arată:

- **Companie**: denumirea, cu localitatea și județul sediului dedesubt;
- **CUI**: cu prefixul RO când firma e plătitoare de TVA;
- **Angajați**: câți angajați actuali are clientul; foștii angajați nu intră în număr;
- **Documentație SSM** și **Documentație PSI**: cât din fiecare set de documente e emis (vezi [Documentația SSM și PSI](#documentația-ssm-și-psi));
- **Adăugat**: ziua în care firma a devenit client, adică ziua în care ai adăugat-o sau, dacă a fost întâi client potențial, ziua în care a devenit client.

Lista e ordonată după denumire și împărțită pe pagini. O poți ordona după oricare dintre coloane. Un clic pe rând deschide pagina clientului, la tabul **Detalii**. Din meniul de la capătul rândului ajungi la **Modifică**, care deschide același tab, și, dacă ești administrator, la **Arhivează…**.

Clienții potențiali nu apar aici. Au lista lor, **Clienți potențiali**, pe care o văd doar administratorii.

### Clienți activi și clienți arhivați

Lista arată implicit clienții **Activi**. Un client arhivat trece la **Arhivați**, cu toate datele și documentele lui. Vezi [Arhivarea unui client](#arhivarea-unui-client).

### Documentația SSM și PSI

Fiecare dintre cele două coloane arată unde se află un set de documente al clientului:

- **Negenerată**: niciun document din set nu a fost generat încă;
- **În lucru**: o parte din set e generată, dar nu toate documentele care i se aplică clientului sunt emise. Lângă stare vezi câte sunt emise, de exemplu „3 din 12 emise”;
- **Emisă**: toate documentele care i se aplică clientului sunt emise.

Un document se numără ca emis de când are o versiune emisă, chiar dacă i-ai generat între timp o versiune nouă, încă ciornă.

Câte documente i se aplică depinde de client. De exemplu, de la 10 angajați actuali ambele seturi cer documente în plus (vezi [De ce contează numărul de angajați](/clienti/angajati/#de-ce-contează-numărul-de-angajați)). Când clientul ajunge la 10 angajați, un set **Emisă** poate trece înapoi la **În lucru**.

Poți ordona lista după aceste coloane ca să vezi întâi clienții la care mai ai de lucru.

## Pagina unui client

În capul paginii vezi denumirea clientului, CUI-ul și câți angajați actuali are. Dedesubt sunt taburile clientului:

- **Detalii**: datele firmei, reprezentantul legal, sediul și punctele de lucru, persoana de contact și, pentru administratori, notițele. Vezi [Detalii](/clienti/detalii/);
- **Angajați**: angajații clientului, cu instruirea și testarea lor. Vezi [Angajați](/clienti/angajati/);
- **Posturi de lucru**, **Mijloace PSI**, **Instruire și responsabili** și **Instruiri ținute**: datele din care se întocmesc documentele și evidența instruirilor;
- **Documente SSM** și **Documente PSI**: cele două seturi de documente;
- **Contract**: contractul de prestări servicii cu clientul, pe care îl văd doar administratorii;
- **Alte documente** și **Portal**.

Documentele se întocmesc din ce completezi în celelalte taburi. Când îți lipsește ceva la generare, lista datelor lipsă te duce la câmpul de completat, pe tabul lui.

## Arhivarea unui client

Arhivezi un client cu care nu mai lucrezi. Doar administratorii pot arhiva și reactiva un client. Alege **Arhivează…** din capul paginii clientului sau din meniul rândului din listă, apoi confirmă.

Arhivarea nu șterge nimic. Clientul iese din lista clienților activi, iar angajații, posturile și documentele lui rămân cum erau și le găsești din **Arhivați**.

Dacă unele documente ale clientului sunt încă ciorne, dialogul îți spune câte: „Un document este încă ciornă și nu va mai putea fi emis cât timp clientul este arhivat.” Dacă vrei să le emiți, emite-le înainte să arhivezi clientul.

Un client arhivat își păstrează CUI-ul. Nu poți adăuga un client nou cu același CUI; reactivează-l pe cel arhivat (vezi [CUI folosit deja](/clienti/adaugare-si-modificare/#cui-folosit-deja)).

## Un client arhivat

Pe pagina unui client arhivat vezi „Client arhivat” și „Datele și documentele lui pot fi consultate și descărcate, dar nu modificate.”

Nimic din ce ține de client nu se mai schimbă până la reactivare: nu poți modifica datele lui, adăuga sau modifica angajați, posturi și puncte de lucru, genera sau emite documente, înregistra instruiri ori trimite invitații în portal. Butoanele acestor acțiuni nu mai apar. Angajații lui nu mai apar nici în lista **Angajați** din meniul lateral.

Dacă un coleg a arhivat clientul cât timp lucrai la el, la salvare vezi „Clientul este arhivat; datele lui nu mai pot fi modificate.”

## Reactivarea unui client

Un administrator reactivează un client cu **Reactivează…**, din capul paginii clientului arhivat sau din meniul rândului din lista **Arhivați**. Clientul revine în lista clienților activi, cu angajații, posturile și documentele lui, și poți lucra din nou la el.

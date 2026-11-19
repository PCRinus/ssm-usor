---
title: Importuri AI
description: Pagina pe care găsești toate importurile echipei, din documente și din fișe, cele care te așteaptă la verificare, cele care se citesc și cele încheiate, și de unde pornești un import nou.
topics:
  - id: importuri.pagina
    heading: Pagina Importuri AI
  - id: importuri.deschise
    heading: Importurile deschise
  - id: importuri.import-nou
    heading: Un import nou
  - id: importuri.incheiate
    heading: Importurile încheiate
sources:
  - apps/app/src/features/imports/open-imports.ts
  - apps/app/src/features/imports/my-imports.tsx
  - apps/app/src/features/imports/imports-header-link.tsx
  - apps/app/src/features/imports/list/imports-layout.tsx
  - apps/app/src/features/imports/list/imports-tab.tsx
  - apps/app/src/features/imports/list/open-imports-list.tsx
  - apps/app/src/features/imports/list/closed-imports-table.tsx
  - apps/app/src/features/imports/list/new-import-button.tsx
  - packages/contracts/src/imports.ts
---

## Pagina Importuri AI

Pe **Importuri AI**, în meniul lateral sub **Clienții tăi**, găsești toate importurile echipei: importurile clienților din documentația lor SSM și SU, pe tabul **Clienți**, și importurile lucrătorilor din fișele de instruire, pe tabul **Lucrători**. Vezi și importurile pornite de colegi, fiecare cu numele celui care l-a pornit.

Numărul de lângă fiecare tab arată câte importuri te așteaptă la verificare. Același număr apare în meniul lateral, lângă fiecare tab, iar cât timp nu ești pe pagină, totalul lor stă lângă **Importuri AI**. Când un import așteaptă verificarea, în capul paginii apare și **Importuri AI**, cu numărul lor; pe telefon e butonul rotund din dreapta sus. Te duce direct pe tabul cu importuri de verificat.

Sub titlu vezi câte credite AI îți mai rămân luna aceasta sau, în perioada de probă, din cele ale perioadei. Cum se socotesc găsești la [Creditele importurilor](/clienti/import/#creditele-importurilor).

## Importurile deschise

Pe fiecare tab, **Deschise** arată importurile la care mai e ceva de făcut, grupate:

- **De verificat**: propunerea unui client e gata, persoanele din fișe te așteaptă sau un client deja creat ori completat are încă instrucțiuni proprii sau evaluări de risc de verificat. Rândul îți spune până când se păstrează importul și are butonul care te duce la verificare: **Verifică propunerea**, **Verifică persoanele** sau **Verifică părțile**.
- **Se citesc**: importurile care se încarcă sau se citesc, cu pasul la care au ajuns și, când se pot număra, câte fișiere sau fotografii s-au citit. Tot aici stă un client deja creat ale cărui instrucțiuni proprii sau evaluări de risc încă se citesc. Un clic pe rând deschide importul.
- **S-au oprit**: importurile a căror citire s-a oprit, cu motivul, și clienții ale căror instrucțiuni proprii sau evaluări de risc nu s-au putut citi, fiecare cu **Vezi importul**.

Lângă fiecare import vezi când a fost pornit și de cine. Un grup fără niciun import nu apare. Un import confirmat sau la care s-a renunțat trece la **Încheiate**. Un client creat sau completat care mai are părți de verificat apare și la **Deschise**, cel mult 14 zile de la confirmare.

## Un import nou

Pe **Deschise**, **Import nou** pornește un import:

- pe tabul **Clienți**, alegi **Client nou din documente**, ca să creezi un client din documentația lui, sau **Completează un client din documente**, ca să alegi întâi clientul și apoi să încarci documentația lui; meniul îți arată și câte credite AI îți mai rămân;
- pe tabul **Lucrători**, alegi clientul, apoi încarci fotografiile fișelor lui de instruire.

Ce urmează e la fel ca atunci când pornești importul din pagina clientului. Vezi [Importul unui client din documente](/clienti/import/#importul-unui-client-din-documente) și [Importul lucrătorilor din fișe](/clienti/import/#importul-lucrătorilor-din-fișe).

## Importurile încheiate

**Încheiate** arată importurile confirmate și pe cele la care s-a renunțat, cel mai recent încheiat primul: clientul, ce a citit AI, rezultatul, când s-a încheiat și cine l-a pornit. Un import confirmat se deschide cu un clic pe rând. Un import la care s-a renunțat apare ca **Renunțat**, nu se mai deschide și iese din listă după 14 zile.

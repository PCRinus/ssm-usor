---
title: Crearea contului și a organizației
description: Cei trei pași de după confirmarea adresei de email, ce preia aplicația de la ANAF și ce poți lăsa pentru mai târziu.
sidebar:
  label: Crearea contului
  order: 1
sources:
  - docs/architecture/adr-004-registration-and-onboarding.md
  - apps/app/src/features/auth/onboarding-page.tsx
  - apps/app/src/features/auth/onboarding-steps.tsx
  - packages/contracts/src/banks.ts
---

După ce îți confirmi adresa de email, aplicația îți cere trei lucruri, fiecare pe ecranul lui: firma ta, cine semnează documentele și datele pentru contract. Sus pe fiecare ecran vezi la ce pas ești, din trei.

Doar primul pas e obligatoriu, pentru că el creează organizația. Pe ceilalți doi îi poți sări, iar ce lași necompletat îți arată apoi ghidul de configurare, din Dashboard.

## Pasul 1: firma

Scrie CUI-ul firmei tale și apasă **Caută la ANAF**. Aplicația preia de la ANAF denumirea, sediul, numărul de la registrul comerțului și, când ANAF le are, telefonul și contul bancar. Mesajul verde îți spune ce a preluat și ce nu are ANAF. Denumirea devine numele organizației, pe care îl poți scurta.

Dacă n-ai CUI-ul la îndemână, poți continua și fără el. Datele firmei le completezi mai târziu, în **Organizație**, la **Date firmă**.

Mai scrii numele tău și accepți Acordul de prelucrare a datelor și Termenii și condițiile. Termenii conțin clauze despre abonament, răspundere și încetare pe care le accepți expres, cum cere Codul civil la art. 1203 pentru clauzele de acest fel. **Creează organizația** te duce la pasul următor.

## Pasul 2: cine semnează

Reprezentantul legal al firmei tale și titlul tău profesional apar pe contractul cu clienții și pe documentele SSM și SU. ANAF nu le are, așa că le scrii aici.

Bifa **Eu sunt reprezentantul legal** e pusă din start și completează numele cu cel scris la pasul 1. Dacă reprezentantul e altcineva, scoate bifa și scrie numele lui, așa cum apare în actele firmei. La funcție scrii, de exemplu, „Administrator”.

Titlul profesional apare lângă numele tău pe documentele pe care le întocmești, de exemplu „Evaluator de riscuri atestat”. Nu e funcția ta din firmă. Îl poți schimba oricând din profilul tău.

## Pasul 3: datele pentru contract

Telefonul firmei și contul bancar apar în contractul de servicii cu clienții. Ce a găsit ANAF la pasul 1 e deja completat și poți schimba.

Banca se completează singură din IBAN, după cele patru litere de după cifrele de control, pentru băncile din România. Dacă banca nu e recunoscută, o scrii tu. Același lucru se întâmplă și la **Date firmă**.

## Ce poți lăsa pentru mai târziu

Pe pașii 2 și 3, **Completez mai târziu** trece la pasul următor fără să salveze nimic de pe ecranul acela. Pe pasul 2, **Sari peste restul și intră în aplicație** te duce direct în aplicație.

Ce ai sărit găsești în ghidul de configurare, la **Completează datele firmei** și **Completează-ți titlul profesional**, și în lista de date care lipsesc când generezi documentele sau contractul. Dacă ai completat ambii pași după căutarea la ANAF, ghidul pornește cu acești doi pași bifați.

Dacă reîncarci pagina în timpul pașilor 2 sau 3, rămâi pe pasul la care erai.

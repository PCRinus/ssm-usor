---
title: Actualizări și versiuni noi ale aplicației
description: Ce s-a schimbat în aplicație, când apare fereastra cu noutățile și ce faci când aplicația îți cere să reîncarci pagina.
sidebar:
  label: Actualizări
  order: 1
sources:
  - docs/architecture/adr-026-updates-and-release-review.md
  - docs/architecture/adr-040-client-contract-and-reload-prompts.md
  - apps/app/src/features/updates/use-update-dialog-open.ts
  - apps/app/src/features/updates/update-dialog.tsx
  - apps/app/src/features/updates/updates-page.tsx
  - apps/app/src/features/reload-prompts/reload-dialog.tsx
  - apps/app/src/features/reload-prompts/new-version-toast.ts
  - apps/app/src/features/reload-prompts/kept-text.ts
---

Aplicația primește versiuni noi des, de obicei de câteva ori pe săptămână. Pentru fiecare versiune care schimbă ceva din ce vezi sau din ce poți face, scriem ce e nou, ce merge mai bine și ce nu mai greșește. Le găsești în **Actualizări**, în partea de jos a meniului. Numărul de lângă **Actualizări** arată câte versiuni n-ai citit încă.

## Fereastra cu noutățile

Când a apărut o versiune pe care n-ai citit-o, aplicația îți arată o dată pe sesiune, după ce te autentifici sau la prima deschidere a aplicației, o fereastră cu cea mai nouă dintre ele: titlul, pe scurt ce aduce și cele mai importante noutăți.

- **Am înțeles** marchează ca citite toate versiunile apărute până acum.
- **Vezi detaliile** deschide pagina versiunii, care o marchează și ea ca citită.
- Crucea închide fereastra doar pentru sesiunea aceasta. Versiunea rămâne necitită, iar numărul din meniu rămâne.

Fereastra apare numai când aplicația din fila ta rulează deja versiunea pe care o anunță, sau una mai nouă. O filă deschisă de ieri lucrează încă pe versiunea de ieri: în ea nu găsești noutățile de azi, așa că nu ți le anunță. De obicei fila îți arată întâi mesajul despre versiunea nouă, descris mai jos, iar fereastra cu noutățile apare după ce reîncarci pagina. Pagina **Actualizări** o poți citi oricând, din orice filă.

Un cont nou nu vede ferestre despre versiunile apărute înainte să fie creat.

## Lista de actualizări

Pagina **Actualizări** arată toate versiunile, de la cea mai nouă, grupate pe luni. Cele pe care nu le-ai citit au semnul **Necitită**, iar **Marchează toate ca citite** le marchează pe toate deodată. Pagina unei versiuni are noutățile, fiecare cu locul din aplicație unde o găsești, apoi îmbunătățirile și remedierile.

Ce ai citit se păstrează în contul tău, așa că nu revezi aceleași noutăți pe alt calculator sau în alt browser.

## Când aplicația îți cere să reîncarci pagina

O filă a aplicației rulează versiunea cu care a fost deschisă până când reîncarci pagina. Când apare o versiune nouă, aplicația îți spune în unul din două feluri.

### O versiune nouă e disponibilă

Jos pe ecran apare mesajul „A apărut o versiune nouă a aplicației. Reîncarcă pagina pentru a o folosi.”, cu butonul **Reîncarcă**. Mesajul nu dispare singur: reîncarci când îți convine, de exemplu după ce salvezi ce lucrai. Dacă îl închizi, nu-l mai vezi până la următoarea versiune nouă.

Cel mai bine e să reîncarci când îl vezi. Așa nu ajungi la fereastra de mai jos în mijlocul lucrului.

### Aplicația trebuie reîncărcată ca să continui

Uneori o versiune nouă schimbă felul în care fila vorbește cu serverul, iar o filă rămasă pe versiunea veche nu mai poate continua. Se întâmplă și când deschizi o secțiune pe care fila n-o încărcase încă. Atunci apare o fereastră: „Aplicația a fost actualizată. Reîncarcă pagina pentru a continua.”, cu butonul **Reîncarcă**. Fereastra nu se poate închide, dar nici nu reîncarcă pagina singură: tu alegi momentul.

Dacă fereastra a apărut chiar când trimiteai o modificare, de exemplu când salvai sau ștergeai ceva, îți spune că ultima modificare nu a fost salvată. Textele lungi scrise în pagină, cum sunt articolele unei instrucțiuni, rămân completate după reîncărcare, iar un mesaj îți confirmă „Am păstrat ce ai scris înainte de reîncărcare.” Fereastra îți spune când a păstrat ceva. Verifică textul și salvează din nou. Câmpurile scurte, cum sunt numele sau CNP-ul, alegerile din liste și ce era scris într-o fereastră deschisă peste pagină nu se păstrează: le completezi din nou. Textul păstrat se pune înapoi doar dacă reîncărcarea te aduce pe aceeași pagină, în cel mult un sfert de oră.

Dacă fereastra apare din nou la mai puțin de un minut după ce ai reîncărcat, aplicația e chiar în curs de actualizare, ceea ce durează de obicei un minut sau două. Butonul **Reîncarcă** numără invers până la sfârșitul minutului, apoi îl poți apăsa.

---
title: Abonamentul
description: Perioada de probă, alegerea și schimbarea planului, plata cu cardul, facturile, anularea și ce se întâmplă cu contul după aceea.
topics:
  - id: organizatie.abonament
    heading: Pagina Abonament
  - id: organizatie.perioada-de-proba
    heading: Perioada de probă
  - id: organizatie.alegerea-planului
    heading: Alegerea planului
  - id: organizatie.pachete
    heading: Pachetele de angajați și utilizatorii în plus
  - id: organizatie.consum
    heading: Cât folosești
  - id: organizatie.schimbarea-planului
    heading: Schimbarea planului
  - id: organizatie.plata-si-facturi
    heading: Plata și facturile
  - id: organizatie.plata-nereusita
    heading: Când plata nu reușește
  - id: organizatie.anulare
    heading: Anularea abonamentului
  - id: organizatie.doar-citire
    heading: Contul doar pentru citire
  - id: organizatie.colegii
    heading: Ce văd colegii
sources:
  - docs/architecture/adr-029-billing-plans-and-trials.md
  - packages/contracts/src/billing.ts
  - packages/contracts/src/subscriptions.ts
  - apps/api/src/modules/billing/service.ts
  - apps/api/src/modules/billing/rules.ts
  - apps/app/src/features/subscription/*.tsx
  - apps/app/src/features/subscription/checkout/*.tsx
---

Abonamentul e al organizației, nu al unei persoane. Îl alege, îl schimbă și îl anulează administratorul organizației; colegii văd planul și cât folosiți, fără sume și fără butoane.

## Pagina Abonament

O găsești în **Organizație**, la tabul **Abonament**, după **Abilitări**. Ajungi tot aici din insigna planului, de lângă sigla din capul paginii, și din banda care apare deasupra paginii când perioada de probă se apropie de sfârșit sau când o plată nu a reușit.

Pagina are trei părți:

- **planul**: numele lui, dacă e lunar sau anual, starea și următoarea plată, cu prețul defalcat pe plan, pachete și utilizatori, plus TVA;
- **Cât folosești**: angajații, utilizatorii și SMS-urile, față de cât include planul (vezi [Cât folosești](#cât-folosești));
- **Plată și facturi**: cardul, adresa la care pleacă facturile și lista facturilor (vezi [Plata și facturile](#plata-și-facturile)).

Prețurile din aplicație sunt fără TVA, la care se adaugă TVA de 21 %. Totalurile arată și suma cu TVA.

## Perioada de probă

Un cont nou începe cu 30 de zile de probă, fără card. În acest timp ai tot ce include **Profesional**: 1.500 de angajați la clienți și 3 utilizatori. Singura diferență: în perioada de probă nu se trimit SMS-uri. Codurile de conectare și de semnare pleacă pe email, iar un angajat fără adresă de email nu poate fi invitat până alegi un plan.

Insigna din capul paginii arată câte zile mai ai. În ultima săptămână apare și o bandă deasupra paginii, pe care o poți închide până a doua zi; în ultima zi nu se mai închide.

Poți alege un plan oricând în perioada de probă, fără să pierzi zilele rămase: cardul se salvează atunci, dar prima plată se face abia în ziua în care s-ar fi încheiat proba. Până atunci lucrezi exact ca înainte, cu limitele probei, iar SMS-urile pornesc din ziua în care ai ales planul. Din acel moment insigna arată numele planului ales, iar banda nu mai apare.

Dacă proba se încheie fără un plan, contul rămâne 30 de zile doar pentru citire (vezi [Contul doar pentru citire](#contul-doar-pentru-citire)).

## Alegerea planului

Apasă **Alege un plan**. Pe pagina care se deschide:

1. Alegi perioada de plată: **Lunar** sau **Anual**. Pe an plătești 10 luni din 12.
2. Alegi planul: **Start** sau **Profesional**. Fiecare card arată ce include.
3. Alegi câte pachete de angajați și câți utilizatori în plus vrei (vezi mai jos).
4. Completezi cardul. Poți plăti și cu Apple Pay sau Google Pay, dacă telefonul sau browserul tău le are.

În dreapta, **Rezumat** arată prețul pe lună sau pe an, TVA-ul și totalul, iar dedesubt ce se întâmplă azi: în perioada de probă, „Azi nu plătești nimic” și data primei plăți; altfel, suma pe care o plătești azi.

Banca îți poate cere să confirmi plata în aplicația ei sau printr-un cod. Fereastra băncii apare peste pagină; după confirmare, te întorci la pagina **Abonament**. Dacă banca refuză cardul, mesajul apare deasupra butonului și poți încerca alt card.

Factura are nevoie de denumirea și de CUI-ul organizației. Dacă lipsesc, completează-le în **Organizație**, la **Date firmă**, apoi revino.

**Enterprise** nu se alege din aplicație. Pentru peste 1.500 de angajați sau o echipă mare, scrie-ne la contact@ssmusor.ro și îți trimitem o ofertă.

### Pachetele de angajați și utilizatorii în plus

**Start** include 250 de angajați la clienți și un utilizator. Peste 250 adaugi pachete de câte 50 de angajați, până la 600 în total, și cel mult încă un utilizator.

**Profesional** include 1.500 de angajați și 3 utilizatori. Peste 1.500 adaugi pachete de câte 500 de angajați, iar utilizatori în plus câți îți trebuie.

Aplicația nu te lasă să alegi mai puține pachete sau utilizatori decât ai azi: dacă ai 312 angajați, Start cere cel puțin 2 pachete. **Start** nu se poate alege deloc dacă ai peste 600 de angajați sau peste 2 utilizatori; cardul planului spune de ce.

## Cât folosești

Se numără:

- **angajații la clienți**: angajații actuali ai clienților activi. Foștii angajați, clienții potențiali și clienții arhivați nu intră în număr. Liniile albe din bară arată unde se termină ce include planul și fiecare pachet;
- **utilizatorii**: membrii organizației, cu tine cu tot;
- **SMS-urile**: câte include planul pe lună. Numărul celor trimise luna aceasta va apărea aici în curând.

Dacă treci de limita de angajați, lucrezi mai departe cu tot ce ai. Pagina îți spune cu câți ai trecut și îți propune pachetul care îți lipsește. SMS-urile peste cele incluse nu se opresc: fiecare costă 0,10 € și apare pe factura următoare. Pe un plan anual, SMS-urile în plus se plătesc lunar.

## Schimbarea planului

Din pagina **Abonament**:

- **Schimbă planul sau pachetele** deschide aceeași pagină ca la alegere, fără card. După ce alegi, **Continuă** îți arată exact ce se schimbă și cât costă, înainte să confirmi;
- **Treci la plata anuală** sau **Treci la plata lunară** schimbă doar perioada.

Ce se întâmplă depinde de schimbare:

- **trecerea de la Start la Profesional, un pachet sau un utilizator în plus** se aplică pe loc. Pe un plan lunar, diferența pentru zilele rămase apare pe factura următoare; pe unul anual se plătește pe loc. Ce aveai înainte se scade pentru partea nefolosită;
- **trecerea de la Profesional la Start, mai puține pachete sau utilizatori** se aplică de la următoarea reînnoire. Până atunci păstrezi ce ai plătit, iar banii nu se returnează. Trecerea la Start adaugă pachetele de care au nevoie angajații de azi, iar fereastra de confirmare ți le arată;
- **de la lunar la anual** se aplică pe loc: plătești anul, din care se scade partea nefolosită din luna curentă;
- **de la anual la lunar** se aplică la sfârșitul anului plătit.

O schimbare programată pentru reînnoire apare pe pagină, cu data ei. O poți retrage cu **Renunță la schimbare**.

În perioada de probă, orice schimbare se aplică pe loc și nu costă nimic; prima plată rămâne în ziua în care se încheie proba.

## Plata și facturile

**Schimbă cardul** deschide o pagină sigură a procesatorului de plăți, unde înlocuiești cardul. Când termini, te întorci în aplicație. Datele cardului nu ajung niciodată la noi.

**Email pentru facturi** e opțional. Dacă îl completezi, de exemplu cu adresa contabilității, facturile pleacă acolo. Dacă îl lași gol, pleacă la adresa ta.

Fiecare factură vine pe email după ce plata a reușit și apare și în lista **Facturi**, de unde o descarci cu **Descarcă PDF**. O factură abia emisă poate arăta câteva minute **PDF în curând**, până e gata documentul.

## Când plata nu reușește

Dacă banca refuză o plată de reînnoire, pagina arată cardul refuzat, iar insigna planului primește un punct. Reîncercăm plata automat în zilele următoare. Ai acces complet încă 14 zile de la prima plată nereușită; data apare pe pagină.

Cel mai repede rezolvi cu **Schimbă cardul**: când salvezi un card nou, plata restantă se reîncearcă pe loc. Dacă plata nu reușește în cele 14 zile, contul devine doar pentru citire.

## Anularea abonamentului

**Anulează abonamentul** deschide o fereastră care îți arată ce urmează:

1. până la sfârșitul perioadei plătite lucrezi ca acum;
2. apoi, timp de 30 de zile, contul e doar pentru citire;
3. după aceea, datele organizației se șterg definitiv.

Poți spune, dacă vrei, de ce pleci. Ce ai plătit nu se returnează, nici pe un plan lunar, nici pe unul anual. Până la sfârșitul perioadei plătite te poți răzgândi cu **Reactivează**, iar abonamentul se reînnoiește din nou ca înainte.

Dacă ai ales un plan în perioada de probă și renunți la el înainte de prima plată, nu plătești nimic și rămâi în perioada de probă până la data ei de sfârșit.

## Contul doar pentru citire

Contul devine doar pentru citire când proba se încheie fără un plan, când se încheie un abonament anulat sau după 14 zile de plată nereușită. Tu, colegii și clienții vedeți și descărcați tot, dar nimeni nu mai poate schimba nimic. Nu se mai trimit SMS-uri. Pagina **Abonament** arată data la care se șterg datele.

Pagina **Abonament** funcționează și în acest timp. Cu **Alege un plan** sau **Reactivează abonamentul** plătești pe loc și contul revine imediat la acces complet, cu tot ce aveai. Dacă o plată de reînnoire e cea care nu a reușit, folosește **Schimbă cardul**: plata se reîncearcă, iar după ce reușește contul revine la acces complet.

## Ce văd colegii

Colegii care nu sunt administratori văd tabul **Abonament** cu planul, starea lui și cât folosiți, plus prețurile planurilor. Nu văd sumele organizației, cardul sau facturile, și nu pot schimba nimic. Dacă aveți nevoie de mai mulți angajați sau de un coleg în plus, administratorul adaugă din pagina lui.

---
title: Persoane responsabile
description: Cine răspunde de ce la un client, cum îi adaugi și ce documente îi numesc, de la conducătorul locului de muncă la șeful echipei de primă intervenție.
topics:
  - id: instruire.persoane-responsabile
    heading: Lista persoanelor responsabile
sources:
  - docs/architecture/adr-005-document-generation.md
  - docs/architecture/adr-010-conditional-documents.md
  - docs/architecture/adr-022-participants-and-the-portal.md
  - packages/contracts/src/document-data.ts
  - apps/app/src/features/training/responsible-persons-card.tsx
  - apps/app/src/features/training/responsible-person-columns.tsx
  - apps/app/src/features/training/responsible-person-dialog.tsx
  - apps/app/src/features/training/responsible-person-schema.ts
---

Persoanele responsabile sunt oamenii pe care clientul îi numește prin decizii: cine face instruirea, cine dă primul ajutor, cine evaluează riscurile, cine acționează în caz de pericol grav și iminent, cine îi reprezintă pe lucrători și cine organizează apărarea împotriva incendiilor. Le găsești pe tabul **Instruire și responsabili**, în ultimul card.

## Lista persoanelor responsabile

Fiecare rând arată o persoană:

- **Nume și prenume**, iar dedesubt legătura ei cu clientul: **Lucrător · acces la portal**, **Lucrător · invitație în portal trimisă**, **Lucrător · fără acces la portal** sau **Nu e în lista lucrătorilor**, pentru cineva care nu e lucrător al clientului, de obicei administratorul;
- **Funcția**, așa cum o tipăresc deciziile;
- **Responsabilități**, în ordinea din decizii, iar dedesubt punctul de lucru, când persoana răspunde doar de unul.

Lista păstrează ordinea după nume. Pe telefon tabelul se derulează spre dreapta, ca să vezi responsabilitățile.

Un clic pe rând deschide persoana ca s-o modifici. Din meniul de la capătul rândului ajungi la **Modifică**, la **Vezi lucrătorul**, când persoana e lucrător al clientului, și la **Scoate din listă**.

### Persoanele pe care documentele le cer

Lângă titlul cardului, **Fără persoană numită** spune ce responsabilitate nu are încă pe nimeni, deși documentele o cer. Un clic pe responsabilitate deschide adăugarea unei persoane, cu ea deja bifată.

Documentele cer întotdeauna un conducător al locului de muncă, o persoană pentru primul ajutor, echipa de evaluare a riscurilor, o persoană pentru pericol grav și iminent, un coordonator privind apărarea împotriva incendiilor și un șef al echipei de primă intervenție. Reprezentantul lucrătorilor e cerut de la 10 lucrători actuali, iar de la 50 sunt ceruți doi; când lipsește doar al doilea, vezi **Reprezentantul lucrătorilor (al doilea)**.

## Adăugarea unei persoane

Alege **Adaugă** de lângă titlul cardului. Începe cu conducătorul locului de muncă. Aceeași persoană poate avea mai multe responsabilități: la o firmă mică, administratorul le are adesea pe toate.

Când persoana e lucrător al clientului, alege-o din listă: numele și funcția se completează din fișa lucrătorului. Altfel scrii numele și funcția. Un lucrător apare o singură dată în listă; pentru o responsabilitate în plus, îl modifici pe cel deja adăugat.

La **Loc de muncă**, alege punctul de lucru de care răspunde persoana, sau lasă **Toate locurile de muncă**. Documentele SU o trec pe fișa de la locul de muncă ales.

## Funcția din contract

Funcția unei persoane se copiază din fișa lucrătorului când o alegi și rămâne așa, pentru că o decizie e un act al clientului. Dacă între timp funcția din contractul lucrătorului s-a schimbat, sub funcție vezi **În contract: …** și **Folosește această funcție**, care o copiază pe cea din contract. Dacă funcția din listă e cea bună, poți lăsa diferența așa.

## Responsabilitățile și documentele lor

- **Conducător al locului de muncă**: face instruirea la locul de muncă și instruirea periodică. Îl numește decizia privind instruirea (1.1), iar tematica și documentele SU îl tipăresc la fiecare punct de lucru.
- **Echipa de evaluare a riscurilor**: decizia 1.2.
- **Prim ajutor**: decizia 1.3. Angajatorul desemnează lucrătorii care aplică măsurile de prim ajutor (Legea 319/2006, art. 10).
- **Pericol grav și iminent**: decizia 1.4, care spune ce se face în caz de pericol grav și iminent: oprirea lucrului, evacuarea, anunțarea (Legea 319/2006, art. 11; HG 1425/2006, art. 103).
- **Reprezentantul lucrătorilor**: decizia 1.5. Îl aleg lucrătorii dintre ei: unul între 10 și 49 de lucrători, doi între 50 și 100 (Legea 319/2006, art. 18; HG 1425/2006, art. 52 și art. 53 alin. (2)). Se alege dintre lucrătorii clientului și nu poate fi reprezentantul legal.
- **Coordonator privind apărarea împotriva incendiilor** și **Șef echipă de primă intervenție**: decizia de organizare a apărării împotriva incendiilor din setul SU (Legea 307/2006, art. 19).

## Scoaterea din listă

Alege **Scoate din listă** din meniul rândului și confirmă. Persoana nu mai e numită în documentele generate de acum înainte. Documentele deja emise rămân neschimbate, iar lucrătorul rămâne în lista lucrătorilor.

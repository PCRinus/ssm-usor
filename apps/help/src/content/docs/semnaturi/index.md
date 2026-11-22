---
title: Semnături
description: Ce îți arată pagina Semnături, ce rubrici semnezi tu și de ce doar ale tale, cum semnezi mai multe fișe cu un singur cod, limita de 30 de semnături pe cod, căutarea și filtrele, și unde ajunge semnătura.
topics:
  - id: semnaturi.lista
    heading: Ce ai de semnat
  - id: semnaturi.rubrici
    heading: Ce rubrici semnezi
  - id: semnaturi.cod
    heading: Semnarea cu un cod
  - id: semnaturi.limita
    heading: Cel mult 30 de semnături cu un cod
  - id: semnaturi.cautare
    heading: Căutarea, filtrele și ordinea
  - id: semnaturi.cereri-reluate
    heading: Când instruirea se schimbă
  - id: semnaturi.fisa-semnata
    heading: Unde ajunge semnătura
sources:
  - docs/architecture/adr-021-training-records-and-individual-sheets.md
  - docs/architecture/adr-023-advanced-electronic-signature.md
  - docs/architecture/adr-024-knowledge-tests.md
  - supabase/migrations/20261118180000_signature_list.sql
  - packages/contracts/src/signatures.ts
  - apps/api/src/modules/signing/signature-list.ts
  - apps/app/src/features/signatures/signature-list-page.tsx
  - apps/app/src/features/signatures/signature-list-columns.tsx
  - apps/app/src/features/signatures/signing-dialog.tsx
---

Pe pagina **Semnături** găsești tot ce ai tu de semnat electronic, la toți clienții: instruirile la care ești instructor sau verificator și fișele de test la care ești examinator. Alegi ce semnezi, ceri un cod și semnezi totul odată.

## Ce ai de semnat

Fiecare rând e o instruire ținută sau o fișă de test care așteaptă semnătura ta. Rândul arată:

- **Ziua** instruirii sau a testului;
- **Ce semnezi**: tipul instruirii (introductiv-generală, la locul de muncă, periodică, periodică suplimentară) sau testul (la angajare, anual), cu domeniul dedesubt;
- **Client**: numele lui te duce la instruirile ținute ale clientului;
- **Semnezi ca**: rubricile tale pe rând, de exemplu „Verificator”, „Examinator” sau, când ai mai multe pe aceeași instruire, „Instructor și verificator”;
- **Lucrători**: câți lucrători așteaptă semnătura ta pe instruire sau, când e unul singur, numele lui, care te duce în tabul lui de instruire. Când ai mai multe rubrici, dedesubt scrie câte semnături înseamnă: 3 lucrători la care ești instructor și verificator sunt 6 semnături. Tot aici vezi, ca avertisment, câți lucrători nu au semnat actul adițional privind semnarea electronică sau, pentru un singur lucrător, „Act adițional nesemnat” ori „Act adițional așteaptă angajatorul”. Avertismentul nu te oprește să semnezi: îți spune doar că e bine să vorbești întâi cu clientul (vezi [Actul adițional privind semnarea electronică](/clienti/angajati/portal-si-act-aditional/)).
- **Așteaptă**: de câte zile a fost cerută semnătura, cu ziua cererii dedesubt.

Săgeata de la începutul unui rând cu mai mulți lucrători îl deschide și îți arată lucrătorii, fiecare cu căsuța lui.

Pagina arată doar semnăturile tale. Nu arată ce mai au de semnat alții, lucrătorii sau colegii tăi: pe acelea le vezi pe pagina clientului și pe instruirea respectivă.

Dacă nu ai nimic de semnat, pagina îți spune asta. O instruire sau o fișă de test apare aici după ce o înregistrezi și ești ales semnatar într-una dintre rubricile ei.

## Ce rubrici semnezi

O instruire are rubrici pentru cel instruit, pentru instructor, pentru verificator (unde fișa o are) și pentru cel care admite la lucru. Aplicația îți propune rubricile după cum se semnează de obicei fișele:

- pe fișa SSM, la instruirea introductiv-generală ești instructor și verificator;
- la instruirea la locul de muncă ești verificator: instruirea o ține conducătorul locului de muncă. HG 1425/2006, art. 94, cere ca instruirea la locul de muncă să fie verificată de conducătorul ierarhic al celui care a instruit; dacă la un client verifică altcineva, treci-l pe el în rubrica de verificator;
- la instruirea periodică și la cea periodică suplimentară ești verificator: instruirea o ține cel pe care tematica de instruire (4.2) îl numește pentru post;
- pe fișa SU semnezi ca instructor acolo unde tu, cadrul tehnic PSI, ai ținut instruirea;
- la o fișă de test semnezi ca examinator.

Rubrica lucrătorului o semnează el, în portal, și nu apare aici. Rubrica „Admite la lucru” e de obicei a conducătorului locului de muncă sau, unde clientul nu are unul, a reprezentantului legal. Apare aici doar când te-ai ales chiar pe tine pentru ea, ceea ce se întâmplă rar; atunci rândul arată, de exemplu, „Verificator și admite la lucru”.

## Semnarea cu un cod

1. Bifezi rândurile pe care vrei să le semnezi. Un rând bifat îți alege toate semnăturile de pe el: toți lucrătorii și toate rubricile tale de pe ei. Ca să lași un lucrător pe altă dată, deschide rândul și debifează-l; căsuța rândului arată atunci o liniuță.
2. În locul barei de căutare apare o bară verde cu numărul de semnături alese, **Deselectează tot** și **Semnează (N)**. N numără semnăturile, nu rândurile.
3. **Semnează** îți arată lista a ceea ce semnezi, pe lucrători și zile. Dacă nu recunoști o instruire, închide fereastra și debifeaz-o: nu o semna.
4. Ceri codul. Codul are 6 cifre și e valabil 10 minute. Vine pe adresa de email a contului tău. Poți cere un cod nou după un minut.
5. Scrii codul. Ai 3 încercări; după a treia îți ceri un cod nou.

Codul semnează exact lista de pe ecran din momentul în care l-ai cerut. O cerere de semnare apărută după aceea, de exemplu pentru o instruire salvată între timp, nu intră în acest cod: o semnezi cu următorul.

La final vezi ce s-a semnat și ce nu, cu motivul. Ce nu s-a semnat rămâne în listă.

Semnătura pe care o dai aici este o semnătură electronică avansată: e legată doar de tine, te identifică, o creezi cu un cod pe care îl primești doar tu și orice modificare ulterioară a fișei se vede (Regulamentul (UE) nr. 910/2014, art. 26). Dacă fișele clientului se semnează electronic hotărăște angajatorul, în regulamentul intern (HG 1425/2006, art. 81 alin. (3¹)); în setul SSM, asta face anexa 13 la regulament.

## Cel mult 30 de semnături cu un cod

Un cod semnează cel mult 30 de semnături. Dacă alegi mai multe, butonul **Semnează** se oprește și bara îți spune câte să debifezi. O instruire cu 31 de lucrători, sau una cu 16 lucrători la care ești instructor și verificator, trece de limită: deschide rândul și debifează câțiva lucrători.

Ca să semnezi mai multe, semnează în reprize: întâi primele 30, apoi pe cele rămase, cu un cod nou.

## Căutarea, filtrele și ordinea

Caseta de căutare găsește rândurile după numele unui lucrător. Nu caută după CNP: ce scrii în casetă rămâne în adresa paginii și în istoricul browserului.

**Filtre** restrânge lista după **Client** (unul sau mai mulți, cu căutare), **Domeniu** (SSM sau SU) și **Ce semnezi** (tipul instruirii sau **Test**). Filtrele alese apar deasupra tabelului, fiecare cu un X care îl scoate. Numărul din dreapta arată câte semnături rămân din câte ai în total.

Lista începe cu cererile cele mai vechi. Poți ordona și după **Ziua** sau după **Client**. Are 25 de rânduri pe pagină.

Ce ai bifat rămâne bifat când treci la altă pagină, așa că poți alege rânduri de pe mai multe pagini și le semnezi împreună. Când schimbi căutarea sau un filtru, alegerea se golește, ca să nu semnezi ceva ce nu mai vezi.

## Când instruirea se schimbă

Dacă modifici o instruire care așteaptă semnături, cererile ei se anulează și se trimit din nou, pentru că s-a schimbat ce semnezi. Rândul rămâne pe pagină, cu ziua noii cereri.

O cerere dispare de pe pagina ta când:

- alegi alt semnatar pentru rubrica ta sau o marchezi semnată pe hârtie;
- clientul e arhivat;
- nu mai faci parte din organizație.

## Unde ajunge semnătura

Semnătura unei instruiri se pune pe fișa individuală de instruire a fiecărui lucrător, în rândul acelei instruiri. Fișa semnată o găsești în tabul **Instruire SSM** sau **Instruire SU** al lucrătorului, la **Originalele** (vezi [Copia de citire și originalele](/clienti/angajati/instruire-si-teste/#copia-de-citire-și-originalele)). Semnătura ta de examinator se pune pe fișa de test, pe care o găsești sub rezultatul testului, în același tab.

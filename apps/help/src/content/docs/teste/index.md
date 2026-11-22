---
title: Teste
description: Cele trei teste de verificare a cunoștințelor și întrebările lor, cum se alcătuiește un test în portal, întrebările predefinite și cele proprii, minimul de zece întrebări active și temeiul fiecărei întrebări.
topics:
  - id: teste.pagina
    heading: Pagina Teste
  - id: teste.cele-trei-teste
    heading: Cele trei teste
  - id: teste.extragere
    heading: Cum se alcătuiește un test
  - id: teste.predefinite-si-proprii
    heading: Întrebări predefinite și proprii
  - id: teste.minimum
    heading: Minimum zece întrebări active
  - id: teste.temei
    heading: Temeiul unei întrebări
sources:
  - docs/architecture/adr-024-knowledge-tests.md
  - packages/contracts/src/tests.ts
  - packages/contracts/src/legal-citations.ts
  - apps/app/src/features/knowledge-tests/test-bank-layout.tsx
  - apps/app/src/features/knowledge-tests/test-bank-sections.ts
  - apps/app/src/features/knowledge-tests/test-bank.tsx
  - apps/app/src/features/knowledge-tests/question-item.tsx
  - apps/app/src/features/knowledge-tests/question-citation.tsx
  - apps/app/src/features/knowledge-tests/question-dialog.tsx
  - apps/app/src/features/knowledge-tests/question-preview-dialog.tsx
  - apps/app/src/features/knowledge-tests/test-format.ts
---

**Teste** ține întrebările celor trei teste de verificare a cunoștințelor pe care le susțin lucrătorii clienților tăi. Întrebările sunt ale organizației tale: aceleași pentru toți clienții.

## Pagina Teste

Sub titlu scrie cum se alcătuiește un test: câte întrebări primește lucrătorul și pragul de promovare (vezi „Cum se alcătuiește un test”).

Fiecare test are tabul lui: **SSM la angajare**, **SU la angajare** și **SU anual**. Sus, pe tab, vezi câte întrebări active are testul și câte ai ascuns, iar cu **Adaugă o întrebare** scrii una proprie pentru acel test.

Fiecare întrebare e o fișă: textul ei, dedesubt **Predefinită** sau **Proprie**, apoi toate variantele de răspuns, una sub alta. Răspunsul corect are pătratul bifat și rândul colorat, iar pe un ecran lat scrie și **Corect** la capăt. E același pătrat în care lucrătorul își bifează răspunsul în portal, unde însă răspunsul corect nu e marcat. O întrebare poate avea mai multe răspunsuri corecte: lucrătorul trebuie să le bifeze pe toate ca să i se numere întrebarea. Sub variante sunt **Explicația** și **Temeiul**, când întrebarea le are.

Butoanele din colțul fișei:

- **Previzualizează** îți arată întrebarea cum o vede lucrătorul în portal: variantele fără răspunsul corect marcat și, dedesubt, explicația pe care o primește după un răspuns greșit.
- **Ascunde din test** și **Repune în test**, la o întrebare predefinită.
- **Modifică** și **Șterge**, la o întrebare proprie.

O întrebare ascunsă rămâne la locul ei, pe un singur rând gri, fără număr, cu **Repune în test**.

## Cele trei teste

Un test nu se trimite: îl așteaptă pe lucrător de la sine, în portal, când îl cere legea.

- **SSM la angajare** încheie instruirea introductiv-generală: „Instruirea introductiv-generală se va finaliza cu verificarea însușirii cunoștințelor pe bază de teste” (HG 1425/2006, normele metodologice, art. 89 alin. (1)).
- **SU la angajare** încheie instruirea la angajare în domeniul situațiilor de urgență. Dispozițiile generale aprobate prin OMAI 712/2005 cer o verificare pe bază de teste la sfârșitul instructajului introductiv general (art. 14) și înainte de admiterea definitivă la lucru (art. 20).
- **SU anual** e verificarea din art. 30 al acelorași dispoziții: „Anual se efectuează o verificare de fond pe bază de teste tip chestionar asupra nivelului de însușire și cunoaștere a problematicii care a făcut obiectul instructajului periodic, rezultatele consemnându-se în fișa individuală de instructaj.” Lucrătorul îl susține la 12 luni de la ultimul test SU promovat.

Testul SU se numește **anual**, nu periodic, pentru că așa îl numește legea. Periodic este instructajul, pe care testul îl verifică o dată pe an.

Legea nu cere un test la instruirea periodică SSM: cât de des se verifică instruirea stabilește angajatorul, prin programul de instruire-testare (HG 1425/2006, normele metodologice, art. 96 alin. (2)). Instruirea periodică se verifică de șeful ierarhic al celui care a ținut-o și, prin sondaj, de angajator, de lucrătorul desemnat sau de serviciul intern ori extern de prevenire și protecție, care semnează fișa de instruire a lucrătorului (art. 96 alin. (4)). Pe fișă, asta e semnătura din rubrica **Verificator**.

Când îl așteaptă un test pe un lucrător anume, ce vezi pe pagina lui și cum înregistrezi un test dat pe hârtie afli în [Testarea](/clienti/angajati/instruire-si-teste/#testarea).

## Cum se alcătuiește un test

În portal, lucrătorul primește 10 întrebări extrase la întâmplare dintre întrebările active ale testului, cu variantele amestecate. Promovează cu 70 %, adică 7 întrebări din 10 răspunse complet corect: o întrebare se numără doar dacă a bifat exact variantele corecte. Poate relua testul imediat, de câte ori e nevoie, iar la fiecare încercare întrebările se extrag din nou.

Cu cât testul are mai multe întrebări active, cu atât o reluare seamănă mai puțin cu încercarea dinainte.

Testul tipărit din documentația clientului (5.1 în setul SSM; 4.1 și 4.2 în setul SU) cuprinde toate întrebările active ale testului, nu doar zece.

Numărul de întrebări și pragul sunt aceleași pentru toate organizațiile și nu se schimbă din aplicație.

## Întrebări predefinite și proprii

Testele pornesc cu **întrebări predefinite**, scrise de noi, fiecare cu o explicație și cu articolul pe care se sprijină. Nu le poți modifica sau șterge, pentru că sunt aceleași pentru toate organizațiile și le corectăm pentru toți deodată.

O întrebare predefinită care nu ți se potrivește o scoți cu **Ascunde din test**: nu mai intră nici în portal, nici în testul tipărit. **Repune în test** o aduce înapoi.

**Întrebările proprii** le scrii tu, cu **Adaugă o întrebare**: textul, între două și patru variante, cel puțin una corectă, și, dacă vrei, o explicație și temeiul. Pe acestea le modifici sau le ștergi oricând.

Explicația e cea pe care o citește lucrătorul după ce a greșit întrebarea. Scrie-o în câteva cuvinte simple. O întrebare fără explicație îi spune lucrătorului doar că a greșit-o. Explicațiile tuturor întrebărilor apar și pe cardul de studiu pe care lucrătorul îl vede în portal înaintea testului.

Conținutul întrebărilor e al tău: aplicația nu verifică dacă un răspuns e corect din punct de vedere al legii.

## Minimum zece întrebări active

Fiecare test păstrează cel puțin zece întrebări active, ca să ajungă pentru o susținere în portal. Decizia privind instruirea în domeniul situațiilor de urgență (1.2) din setul SU al clientului promite chiar asta: „un test grilă de minimum 10 întrebări”.

Lângă numărul de întrebări active scrie **minimum 10** cât timp testul are zece sau mai puține. Atunci **Ascunde din test** nu ascunde întrebarea, ci îți spune: „Testul are minimum 10 întrebări active. Adaugă întâi una proprie, apoi o poți ascunde pe aceasta.” Butonul **Adaugă o întrebare** din mesaj deschide formularul pentru acel test. O întrebare proprie nu se poate șterge din același motiv.

## Temeiul unei întrebări

Temeiul spune pe ce act și articol se sprijină întrebarea, de exemplu „Legea 319/2006, art. 23 alin. (1) lit. e)”. Actele pe care aplicația le urmărește în [Legislație](/legislatie/) apar ca linkuri: fiecare deschide, într-un tab nou, Portalul Legislativ la articolul sau anexa citată, în forma consolidată actuală. Cât timp locul articolului nu e cunoscut, linkul deschide pagina actului.

Ce nu numește un act urmărit rămâne text simplu, de exemplu trimiterile la instrucțiunile proprii (IPSSM 3.1, IPSU 2.1), care nu au o pagină publică.

La o întrebare proprie, temeiul îl scrii cum îl scrie toată lumea. Aplicația recunoaște singură actele și articolele din el.

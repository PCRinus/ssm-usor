---
title: Evaluări de risc
description: Biblioteca de evaluări de risc a organizației, fișa de evaluare a unui client cu factorii, clasele și măsurile ei, și ce cer evaluarea riscurilor și planul de prevenire și protecție ca să se genereze.
topics:
  - id: evaluari-de-risc.ce-este
    heading: Ce este o evaluare de risc
  - id: evaluari-de-risc.biblioteca
    heading: Biblioteca
  - id: evaluari-de-risc.evaluare-noua
    heading: O evaluare nouă
  - id: evaluari-de-risc.salvare
    heading: Salvarea unei fișe în bibliotecă
  - id: evaluari-de-risc.pagina-evaluarii
    heading: Pagina unei evaluări din bibliotecă
  - id: evaluari-de-risc.utilizare
    heading: Unde este folosită o evaluare
  - id: evaluari-de-risc.aplicare
    heading: Aplicarea la o fișă
  - id: evaluari-de-risc.arhivare
    heading: Arhivarea și ștergerea
  - id: evaluari-de-risc.fisa
    heading: Fișa de evaluare a unui client
  - id: evaluari-de-risc.in-afara-posturilor
    heading: Fișele în afara posturilor
  - id: evaluari-de-risc.grupuri-sensibile
    heading: Grupurile sensibile
  - id: evaluari-de-risc.sistemul-de-munca
    heading: Sistemul de muncă
  - id: evaluari-de-risc.factori
    heading: Factorii de risc
  - id: evaluari-de-risc.clase
    heading: Gravitatea, probabilitatea și nivelul de risc
  - id: evaluari-de-risc.nivel-global
    heading: Nivelul de risc global
  - id: evaluari-de-risc.masuri
    heading: Măsurile de prevenire
  - id: evaluari-de-risc.plan
    heading: Câmpurile planului de prevenire
  - id: evaluari-de-risc.copiere
    heading: Factorii altei fișe a clientului
  - id: evaluari-de-risc.provenienta
    heading: Factorii veniți din bibliotecă
  - id: evaluari-de-risc.documente
    heading: Ce cer documentele 9 și 10
sources:
  - docs/architecture/adr-015-risk-assessment.md
  - docs/architecture/adr-036-risk-library-and-import.md
  - packages/contracts/src/risk-evaluations.ts
  - packages/contracts/src/risk-levels.ts
  - apps/app/src/features/evaluation-profiles/*.tsx
  - apps/app/src/features/evaluation-profiles/*.ts
  - apps/app/src/features/risk-evaluations/*.tsx
  - apps/app/src/features/risk-evaluations/*.ts
  - apps/app/src/features/missing-data/missing-rows.ts
  - apps/api/src/modules/documents/context.ts
---

Evaluarea riscurilor se face pe fișe de evaluare: câte una pentru fiecare post al unui client și, unde e cazul, pentru grupurile sensibile și pentru alte persoane expuse. Din aceleași fișe aplicația generează evaluarea riscurilor de accidentare și îmbolnăvire profesională (documentul 9) și planul de prevenire și protecție (documentul 10). Un post pe care îl evaluezi des, ca lucrătorul de birou sau vânzătorul, îl păstrezi în bibliotecă și îl aplici la orice client.

## Ce este o evaluare de risc

Angajatorul trebuie să aibă o evaluare a riscurilor pentru securitatea și sănătatea în muncă, „inclusiv pentru acele grupuri sensibile la riscuri specifice” (Legea nr. 319/2006, art. 12 alin. (1) lit. a)). Pericolele se identifică și riscurile se evaluează pentru fiecare componentă a sistemului de muncă (executant, sarcină de muncă, mijloace de muncă, mediul de muncă), pe locuri de muncă sau posturi de lucru (H.G. nr. 1425/2006, art. 15 alin. (1) pct. 1).

Aplicația evaluează prin metoda I.N.C.D.P.M. București: pentru fiecare factor de risc alegi o clasă de gravitate și una de probabilitate, iar nivelul de risc se citește din grila metodei. Capitolele care descriu metoda se tipăresc la fel pentru toți clienții.

Două cuvinte numesc două lucruri diferite:

- o **evaluare de risc** e o intrare din biblioteca organizației tale, numită după post („Bucătar”), pe care o aplici la clienți;
- o **fișă de evaluare** e a unui client: a unui post al lui sau a unei categorii de persoane din afara posturilor. Ea intră în documentele clientului.

## Biblioteca

Biblioteca e în meniul **Evaluări de risc**. Pornește goală: aplicația nu vine cu factori de risc scriși de noi, așa că biblioteca se umple din posturile pe care le evaluezi tu.

Lista arată, pentru fiecare evaluare, câți factori are și câți dintre ei sunt inacceptabili, nivelul de risc global, la câți clienți e folosită și data ultimei modificări. Implicit lista arată evaluările nearhivate, sub titlul **Evaluări în uz**; **Arată arhiva** îți arată evaluările arhivate, iar **Arată evaluările în uz** te întoarce la celelalte.

Meniul fiecărui rând, cele trei puncte de la capăt, are **Redenumește**, **Arhivează** sau **Reactivează** și, pentru o evaluare pe care nu o folosește niciun client, **Șterge**. Două evaluări nu pot avea același nume, nici când una e arhivată: deosebește-le prin nume, de exemplu „Lucrător de birou – contabilitate”.

### O evaluare nouă

**Evaluare nouă**, sus pe pagină, îți cere doar numele postului. După ce o creezi, se deschide pagina ei și îi adaugi factorii de risc, ca într-o fișă.

### Salvarea unei fișe în bibliotecă

Calea cea mai scurtă e să evaluezi întâi postul la un client și să salvezi fișa. Pe pagina unei fișe cu cel puțin un factor, **Salvează în bibliotecă** copiază într-o evaluare nouă din bibliotecă factorii fișei, cu clasele, măsurile și câmpurile planului, și textele sistemului de muncă. Numele propus e al fișei; îl poți schimba.

Cât timp niciun factor al unei fișe nu vine din bibliotecă, sub factori apare îndemnul „Factorii nu sunt încă în biblioteca organizației tale”, cu același buton. Cu **Nu acum** îndemnul nu mai apare la fișa respectivă, în browserul în care l-ai închis.

La un client activ, după salvare factorii fișei arată că sunt în evaluarea nou creată, iar clientul apare la [Unde este folosită o evaluare](#unde-este-folosită-o-evaluare).

## Pagina unei evaluări din bibliotecă

Pagina unei evaluări din bibliotecă are aceleași carduri ca o fișă: **Rezultatul evaluării**, **Sistemul de muncă** și **Factori de risc**, pe care le completezi la fel ca în [fișa de evaluare a unui client](#fișa-de-evaluare-a-unui-client). Diferențele:

- **Sistemul de muncă** are doar mijloacele de producție, mediul de muncă și expunerea, toate opționale. Sarcina de muncă și persoanele expuse vin din postul clientului. O expunere lăsată goală lasă fiecărei fișe expunerea ei.
- **Termenele și responsabilii** din plan sunt valori implicite: se copiază în fișă și le schimbi acolo pentru fiecare client.
- Ce schimbi aici nu ajunge în fișele în care ai aplicat deja evaluarea.

Sus ai **Redenumește…**, **Arhivează** sau **Reactivează** și, pentru o evaluare nefolosită, **Șterge evaluarea…**.

### Unde este folosită o evaluare

O evaluare e folosită cât timp cel puțin un factor din fișa unui client a venit din ea: prin aplicare, prin salvarea fișei în bibliotecă sau prin copierea factorilor de la altă fișă.

- Coloana **Folosită la** din listă numără clienții, „3 clienți”. Fișele posturilor arhivate nu se numără, așa că o evaluare folosită doar la posturi arhivate arată „—”.
- Cardul **Unde este folosită**, pe pagina evaluării, arată fișele grupate pe clienți, cu câți factori din această evaluare are fiecare, și te duce la fiecare fișă. Un client arhivat apare cu „(arhivat)”.

## Aplicarea la o fișă

Pe pagina fișei unui client, în cardul **Factori de risc**, **Aplică din bibliotecă** îți arată evaluările din bibliotecă care au cel puțin un factor și nu sunt arhivate. Alegi una și apeși **Aplică evaluarea**:

- **Factorii** evaluării, cu clasele, măsurile și câmpurile planului, se adaugă după cei pe care fișa îi are deja. Poți aplica astfel două evaluări la aceeași fișă, de exemplu una de birou și una de condus auto.
- **Textele sistemului de muncă** (mijloacele de producție, mediul de muncă și expunerea) completează doar câmpurile goale ale fișei; un text scris deja în fișă nu se înlocuiește. Expunerea contează ca goală cât timp e „8 h / schimb”. Dacă aplici două evaluări una după alta, textele vin de la prima.
- **Termenele și responsabilii** se copiază ca în bibliotecă. Îi schimbi în fișă cu persoanele și termenele clientului.

După aplicare, ajustează clasele la acest client: evaluarea e judecata ta profesională, iar aplicația nu alege nicio clasă în locul tău.

Fișa primește o copie, nu o legătură. Ce schimbi apoi în fișă nu ajunge în bibliotecă, iar ce schimbi în bibliotecă nu ajunge în fișă.

## Arhivarea și ștergerea

O evaluare pe care nu o mai aplici o arhivezi. Arhivată, nu mai apare în **Aplică din bibliotecă**, dar își păstrează pagina, factorii și lista clienților care o folosesc. Fișele în care ai aplicat-o își păstrează factorii, pentru că au copiile lor. **Reactivează** o aduce înapoi.

Doar o evaluare pe care nu o folosește niciun client se poate șterge: pentru una folosită, meniul nu are **Șterge**, ci doar **Arhivează**. La fel, o evaluare folosită doar la clienți sau posturi arhivate nu se poate șterge. Un singur factor al unei evaluări folosite se poate șterge oricând; fișele își păstrează copia lui.

## Fișa de evaluare a unui client

Fișa unui post o găsești pe pagina postului, în cardul **Fișa de evaluare**, cu **Începe evaluarea** cât timp postul nu are fișă și **Deschide fișa** după aceea. Tabelul posturilor are o coloană **Fișa de evaluare** cu starea fiecărui post. Un post nu poate declara că nu are nevoie de evaluare.

Fișa are trei carduri:

- **Rezultatul evaluării**: nivelul de risc global, ponderea factorilor pe componente și grila metodei;
- **Sistemul de muncă**: postul și textele care îl descriu;
- **Factori de risc**: factorii, cu clasele și măsurile lor.

**Șterge fișa…** șterge fișa cu factorii și măsurile ei. La un client arhivat, fișa se poate doar citi.

### Fișele în afara posturilor

Pe tabul **Posturi de lucru** al clientului, cardul **Fișe de evaluare în afara posturilor** ține fișele care nu sunt ale unui post: a grupurilor sensibile și ale altor persoane expuse. Cu **Adaugă o fișă** dai un nume categoriei, de exemplu „Vizitatori” sau „Personalul firmelor de curățenie”, și o evaluezi ca pe un post.

O fișă în afara posturilor are, la sistemul de muncă, și **Sarcina de muncă** și **Persoanele expuse**, pe care un post le ia din activitățile și angajații lui.

### Grupurile sensibile

Grupurile sensibile la riscuri specifice sunt femeile gravide, lăuze sau care alăptează, tinerii sub 18 ani și persoanele cu dizabilități. Legea cere evaluarea lor acolo unde clientul are astfel de lucrători, așa că rândul **Grupuri sensibile** din card are două ieșiri:

- **Evaluează** pornește fișa grupurilor sensibile;
- **Nu există grupuri sensibile** înregistrează că clientul a declarat că nu are lucrători din aceste grupuri. Evaluarea riscurilor și planul de prevenire tipăresc o propoziție care spune asta.

După declarație, **Evaluează totuși** pornește fișa și înlocuiește declarația, iar **Modifică** o retrage. Dacă ștergi fișa grupurilor sensibile, întrebarea se redeschide.

## Sistemul de muncă

Cardul descrie postul evaluat. Pentru un post, sarcina de muncă vine din activitățile lui, iar persoanele expuse din numărul de angajați actuali. Tu scrii:

- **Mijloace de producție**: echipamentele de muncă, uneltele și materialele folosite;
- **Mediul de muncă**: spațiul, microclimatul, iluminatul, zgomotul;
- **Expunere**: „8 h / schimb” dacă nu o schimbi.

Evaluarea riscurilor tipărește descrierea postului din aceste texte și din datele postului.

## Factorii de risc

**Adaugă un factor** deschide formularul unui factor:

- **Componenta sistemului de muncă**: executant, sarcina de muncă, mijloace de producție sau mediul de muncă;
- **Grupa**: lista îți propune grupele metodei pentru componenta aleasă, ca „Factori de risc mecanic” sau „Acțiuni greșite”, și grupele pe care le-ai scris înainte; poți scrie și alta;
- **Descrierea factorului**: forma concretă în care apare la acest loc de muncă, de exemplu „Electrocutare prin atingere indirectă – deteriorarea sau inexistența instalațiilor de împământare”.

Cu **Adaugă încă unul** bifat, formularul se golește după salvare și păstrează componenta și grupa, ca să scrii la rând factorii aceleiași grupe.

Lista se poate filtra pe componente și ordona după nivel, gravitate, probabilitate sau măsuri. În grila metodei din **Rezultatul evaluării**, o celulă aleasă îți arată doar factorii ei. Un factor căruia îi lipsește ceva pentru documente spune ce lipsește chiar în rândul lui.

### Gravitatea, probabilitatea și nivelul de risc

Clasele le alegi tu, ca evaluator:

- **Clasa de gravitate**, de la 1 la 7, după consecința maximă previzibilă: de la „Minore reversibile” la „Deces”;
- **Clasa de probabilitate**, de la 1 la 6, după cât de des se poate produce: de la „o dată la peste 10 ani” la „mai des de o dată pe lună”.

**Nivelul de risc**, de la 1 la 7, nu se scrie: aplicația îl citește din grila metodei, gravitate față de probabilitate, și îl schimbă când schimbi o clasă. Un factor cu nivelul peste 3 e **inacceptabil** și are nevoie de cel puțin o măsură de prevenire.

Consecința nu e un câmp separat: fișa tipărește formularea clasei de gravitate.

### Nivelul de risc global

Nivelul de risc global al fișei e media ponderată a metodei: fiecare nivel de factor cântărește cât el însuși, deci factorii cu nivel mare trag media în sus. Se afișează cu două zecimale. Peste 3,5 fișa e **peste limita acceptabilă**.

Nivelul global al unității, din evaluarea riscurilor, se calculează la fel, din nivelurile globale ale fișelor.

### Măsurile de prevenire

Fiecare măsură are un fel, din cele patru coloane ale planului: **Tehnică**, **Organizatorică**, **Igienico-sanitară** sau **Altă măsură**. Un factor poate avea mai multe măsuri, de feluri diferite. Un factor fără măsuri nu intră în planul de prevenire.

### Câmpurile planului de prevenire

Pentru planul de prevenire și protecție, factorul mai are:

- **Acțiuni în vederea realizării măsurilor**, opțional;
- **Termen**: „Permanent”, o dată sau o periodicitate, ca „trimestrial”;
- **Persoana care răspunde** de măsuri la client, de obicei administratorul. Lista îți propune reprezentantul legal, persoanele responsabile ale clientului și numele folosite înainte;
- **Observații**, opțional.

Termenul și persoana care răspunde sunt cerute pentru fiecare factor care are măsuri. Pe termen, acțiuni și observații, câmpul îți propune ce ai scris înainte.

Planul are o coloană pentru fiecare dintre aceste câmpuri și pentru fiecare fel de măsură: coloanele din anexa nr. 7 la H.G. nr. 1425/2006, rubricile pe care planul trebuie să le aibă cel puțin (art. 46).

### Factorii altei fișe a clientului

**Copiază de la altă fișă**, în cardul **Factori de risc**, adaugă factorii altei fișe a aceluiași client, cu clasele, măsurile și câmpurile planului, după cei pe care fișa îi are deja. E calea potrivită pentru două posturi asemănătoare ale aceluiași client. Ajustează apoi clasele la noul loc de muncă.

### Factorii veniți din bibliotecă

Un factor venit din bibliotecă arată sub descriere „În evaluarea … din bibliotecă”, cu legătură spre evaluarea respectivă, iar cardul **Factori de risc** spune câți factori ai fișei vin din fiecare evaluare și câți nu sunt în bibliotecă. Originea rămâne și după ce modifici factorul în fișă: arată de unde a pornit, nu că cele două sunt la fel.

## Ce cer documentele 9 și 10

Evaluarea riscurilor (documentul 9) și planul de prevenire și protecție (documentul 10), din Documente SSM, se generează din fișele clientului. Ca să le poți genera:

- fiecare post actual are fișa de evaluare, cu cel puțin un factor de risc;
- grupurile sensibile sunt evaluate, cu cel puțin un factor, sau clientul a declarat că nu are lucrători din aceste grupuri;
- fiecare factor inacceptabil, peste nivelul 3, are cel puțin o măsură de prevenire;
- fiecare factor care are măsuri are un termen și o persoană care răspunde.

Formularul de generare îți arată ce lipsește, fișă cu fișă, cu o legătură spre locul unde completezi. Evaluarea riscurilor mai numește echipa de evaluare a riscurilor, din persoanele responsabile ale clientului, și evaluatorul de riscuri al organizației; fără evaluator, numește specialistul care generează.

Evaluarea riscurilor are un subcapitol pentru fiecare fișă: întâi posturile, în ordinea din tabelul posturilor, apoi grupurile sensibile și celelalte fișe. Planul are câte un tabel pentru fiecare fișă. Un rând al lui e un factor care are cel puțin o măsură, întâi cei inacceptabili, apoi după nivel.

Documentele generate nu se schimbă singure: dacă modifici o fișă după generare, generezi din nou evaluarea riscurilor și planul ca să ia schimbarea.

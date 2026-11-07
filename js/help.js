// ── Hjälp ("?" i sidhuvudet) ─────────────────────────────────────────────
// Klassiskt script. Beror på index.html: el(), esc(). Global entry: openHelp().
// Kort förklaring av sidan man står på (ui_forslag.md §8), i samma sidopanel som redigeringen. Texten väljs på längsta
// matchande början av adressen (#/st/krav före #/st).

const HELP = [
  ['#/', 'Startsida', [
    'Det viktigaste från alla moduler på ett ställe: det du behöver ta hand om, dagens opjour och dina pass, din vecka, veckoschemat, dina aktiviteter framåt, bemanningen, ditt förlopp, vad som är kvar under ditt ST-år, dina senaste bedömningar i DOPS och nytt i utbildningsmaterialet.',
    'Korten syns bara om de gäller dig. Klicka på länken under ett kort för att gå vidare, och på en bedömning i DOPS-kortet för att läsa den. Fliken Startsida och loggan uppe till vänster leder alltid hit. På telefon finns alla moduler och deras undersidor i menyn ☰.',
    '<strong>Anpassa</strong> (uppe till höger) gör korten redigerbara. Dra i ⠿ och släpp kortet på valfri ruta, även en tom. De andra korten ligger kvar. Får kortet inte plats i sin storlek där du släpper det fälls det ihop (stor → bred → hög → liten) tills det får plats. Markeringen under pekaren visar var kortet hamnar. Med tangentbordet: markera ⠿ och använd piltangenterna.',
    'Välj storlek (liten, bred, hög eller stor; storlekar som inte får plats där kortet ligger är gråa), ⚙ för vad kortet ska visa (antal väljer du fritt) och ✕ för att dölja det. Dolda kort, och nya kort som Veckoschemat, Mina aktiviteter och Utbildningsmaterial, ligger under rutnätet och läggs till med +. Tryck <em>Klar</em> för att spara. Layouten sparas på ditt konto och gäller på alla enheter. <em>Återställ</em> går tillbaka till standardlayouten.',
    'På telefon och smala skärmar ligger korten i läsordning. Där flyttar du dem i ordning; fri placering gör du på en större skärm.',
    'Vill du börja på en annan sida när du öppnar ST-Lotsen: välj startsida under Inställningar → Mitt konto.']],
  ['#/utbildning', 'Utbildningsmaterial', [
    'Klinikens samling av bra utbildningsmaterial (artiklar, videor, kurser), ordnad i områden. Områdena finns i undermenyn.',
    'Videor från YouTube, Vimeo och videofiler (.mp4) spelas upp direkt på sidan med <em>▶ Spela upp här</em>. Övriga länkar öppnas i en ny flik.',
    '<strong>Alla kan föreslå</strong> nytt material, ändringar (✎) och borttagning (✕), och nya områden. Förslaget går till klinikens admin, som godkänner det, justerar det först eller avböjer med ett svar. Dina förslag och svaren ser du under <em>Mina förslag</em>.',
    '<strong>Admin</strong> lägger till, ändrar, flyttar (↑↓) och tar bort direkt, och behandlar förslagen under <em>Förslag</em>. Väntande förslag syns också under Att göra på startsidan.']],
  ['#/kalender', 'Opjour · Kalender', [
    'Vem som har opjour vilken dag. Klicka på en dag för att se detaljer och boka eller släppa ditt pass.',
    'Passet byter person vid den tid kliniken har ställt in (Inställningar → Opjour).']],
  ['#/stats', 'Opjour · Statistik', ['Hur passen fördelas: per person, över tid och hur rättvis lottningen är.']],
  ['#/installningar/opjour', 'Opjour · Inställningar', ['När passet byter person, vilka som räknas som reserv och i statistiken, och väggskärmar som visar dagens opjour.', '<strong>Synk från Google-formuläret:</strong> tills ST-Lotsen ersätter det nuvarande opjoursystemet hämtas bokningar (med historik) och reservlistan från arket. Arket gäller helt och hållet: bokningar som inte stämmer med arket ändras eller avbokas, även sådana som gjorts i ST-Lotsen. <em>Förhandsgranska</em> visar vad som skulle ändras utan att ändra något. Koppla namnen i arket till användare under <em>Namn i arket</em>.']],
  ['#/installningar/planering', 'Planering · Inställningar', [
    '<strong>Bemanning:</strong> minsta antal ST-läkare i tjänst. Veckor under gränsen blir röda i schemat och på startsidan.',
    '<strong>Aktivitetstyper:</strong> kodorden i schemat. De tre knapparna styr om en vecka med typen räknas som i tjänst, ej i tjänst eller inte påverkar. Klicka på en typ för att ändra namn, färg och om den <em>förlänger ST</em> (föräldra- och tjänstledighet skjuter fram beräknat ST-slut); dra (eller ↑↓ på mobil) för att ändra ordningen.']],
  ['#/schema', 'Planering · Veckoschema', [
    'En rad per ST-läkare, en kolumn per vecka. Klicka i en cell för att lägga in eller ändra en aktivitet. Dra över flera veckor i en rad för att lägga in en period.',
    'Raden "I tjänst" räknar hur många som är i tjänst varje vecka. Röd = under klinikens gräns.',
    'På mobil: välj <em>Jag</em> eller <em>Alla</em> för en lista per vecka.',
    '<strong>Ej tilldelat</strong> (studierektor och admin): lägg in randningar och kurser som ännu inte har någon person. Klicka på perioden och <em>Välj person</em> — de som inte gjort momentet visas först, med det de redan har inlagt de veckorna. <em>Tilldela</em> gör perioden till en vanlig post i personens rad.',
    '<strong>Importera jobbschema</strong> (studierektor): välj exporten från schemasystemet (.xlsx, en kolumn per dag). ST-läkarna matchas på namn, övriga läkare hoppas över. Du väljer vilka koder som blir vilken aktivitetstyp (t.ex. Randning → Rand, Föräldraledig → FL) och hur många dagar i veckan som krävs. Fynden granskas ett i taget: <em>Acceptera</em> sparar posten direkt, <em>Avvisa</em> hoppar över den; vid krock väljer du <em>Lägg till också</em> eller <em>Ersätt</em>. Det som redan finns i veckoschemat visas bara.']],
  ['#/oversikt', 'ST-utbildning · Måluppfyllelse', [
    'Alla ST-läkare mot klinikens krav. ✓ klart, ▶ pågår (startveckan har kommit), ◷ bokat i schemat, ? förslag, ✎ plan, · ej gjort än, ! saknas (personen har passerat kravets ST-år). Peka på en ruta för hela texten, klicka för att ange status för hand.',
    'Klicka på en rubrik för att sortera: ST-läkare, ST-tid, % klart eller ett krav (de som gjort det först). Klicka igen för omvänd ordning. Filtrera på kategori och växla mellan kompakt och detaljerad vy.']],
  ['#/plan', 'Utbildningsplan', [
    '<strong>Översikt:</strong> förloppet per ST-år och kraven med status. <strong>Delmål:</strong> målbeskrivningens delmål med kopplade krav och hur många som är klara. <strong>Historik:</strong> ändringar i planen och status satt för hand. Ingen signering behövs — ST-läkaren håller själv koll, handledaren ser planen.',
    '<strong>Ändra planen:</strong> dra ett krav till ett annat år, eller klicka på det för att flytta eller ta bort det. Det gäller bara den här ST-läkarens plan — klinikens mall ändras inte. Ändringarna syns i Historik.',
    '<strong>Beräknat ST-slut</strong> är ST-start + 5 år + veckor med föräldra- eller tjänstledighet i veckoschemat.',
    '<strong>Skriv ut</strong> ger en A4 med översikt och delmål.']],
  ['#/dops', 'DOPS · Översikt', [
    'Dina mottagna och registrerade bedömningar per formulärtyp, med klinikens mål (per 6 månader, skalat med vald period) och en graf över tid. <em>Ej aktuellt</em> döljer ett formulär för dig — låst tills ST-Lotsen får skriva i DOPS-appens databas.']],
  ['#/dops/registrera', 'DOPS · Registrera bedömning', ['Välj mottagare och formulär och fyll i ett avsnitt i taget; <em>Fortsätt</em> följer formulärets hoppregler. <strong>Skicka</strong> är låst tills ST-Lotsen får skriva i DOPS-appens databas — registrera i DOPS-appen så länge.']],
  ['#/dops/inkorg', 'DOPS · Inkorg', ['Förfrågningar om bedömning till dig, och de du skickat. <em>Bedöm nu</em> öppnar formuläret ifyllt. Att skicka förfrågningar och markera läst/utförd är låst tills vidare.']],
  ['#/dops/mina', 'DOPS · Mina bedömningar', ['Mottagna och skickade bedömningar med alla svar. Filtrera på datum och formulärtyp. Markera bedömningar och <strong>Exportera till Word</strong> för att ladda ner dem. Att ta bort en bedömning är låst tills vidare.']],
  ['#/dops/kliniken', 'DOPS · Kliniken', ['Klinikens alla bedömningar, för Studierektor och Administratör i DOPS. Filtrera på datum, mottagarkategori, mottagare och formulärtyp.']],
  ['#/dops/statistik', 'DOPS · Statistik', ['Klinikens statistik för Studierektor och Administratör i DOPS: bedömningar över tid, fördelning per formulär, tidsåtgång och sparad tid, fritextåterkoppling, måluppfyllelse per person, vem som saknar bedömning, spridning av bedömare, mest aktiva och förfrågningar. Filtrera på datum och formulärtyp.']],
  ['#/dops/tavling', 'DOPS · Tävling', ['Kvartalstävlingen: flest registrerade och flest mottagna bedömningar under en omgång. Att starta eller avsluta en omgång är låst tills ST-Lotsen får skriva i DOPS-appens databas.']],
  ['#/dops/dokument', 'DOPS · Dokument', ['Mallar och avtal för kliniker som vill ansluta till DOPS (Administratör).']],
  ['#/installningar/dops', 'DOPS · Inställningar', ['DOPS-appens inställningar för Studierektor och Administratör: klinik (inaktivering, förfrågningar), formulär (grupper, vilka roller som ser dem, mål per 6 månader), användare och behörigheter, schemalagda utskick och — för global Administratör — formulärbyggaren. Att spara är låst tills ST-Lotsen får skriva i DOPS-appens databas. Kopplingen av konton mellan ST-Lotsen och DOPS finns under Inställningar → Användare.']],
  ['#/dops/progress', 'DOPS · Progress', [
    'Bedömningarna (DOPS, Mini-CEX m.fl.), direkt ur DOPS-appens databas. Bara läsning — nya bedömningar görs i DOPS-appen (moradops.se) tills registreringen slås på här.',
    'Välj formulärtyp. Skalfrågor visas som kurva över tid med medelvärde (streckad linje), flervalsfrågor som fördelning, därefter fritextsvaren och varje bedömning.',
    'Du ser dina egna bedömningar. Den som är Studierektor eller Administratör i DOPS väljer person och ser alla på kliniken.']],
  ['#/installningar/st/delmal', 'ST-utbildning · Delmål', ['Klinikens målbeskrivning och hur väl kraven täcker delmålen. Välj målbeskrivning i listan ovanför tabellen (t.ex. HSLF-FS 2021:8). <strong>Klicka på ett delmål</strong> för att välja vilka krav som räknas till det; det går också från ett krav under fliken Krav.']],
  ['#/installningar/st/personer', 'ST-utbildning · ST-läkare och handledare', ['Vem som är ST-läkare, ST-start och -slut, målbeskrivning och handledare. Studierektorsrollen sätts under Inställningar → Användare.']],
  ['#/installningar/st', 'ST-utbildning · Krav', [
    'Klinikens mall: det som ska uppnås, per ST-år. ST-läkarna ser samma vy i sin utbildningsplan.',
    '<strong>Dra</strong> ett krav till ett annat år, <strong>klicka</strong> för att ändra det (delmål, randning, längd, i tjänst).']],
  ['#/installningar/konto', 'Inställningar · Mitt konto', ['Ditt namn, användarnamn, telefon, e-post, startsida och PIN.']],
  ['#/installningar/klinik', 'Inställningar · Klinik', ['Vilka moduler kliniken använder.',
    '<strong>Global admin:</strong> välj vilken klinik du arbetar i — valet gäller hela ST-Lotsen tills du byter tillbaka (gul rad överst). <em>Importera inställningar</em> hämtar valda delar (jourbytestid, moduler, aktivitetstyper, krav med delmål, bemanning, målbeskrivning, jobbschemats koder) från en annan klinik. Inget tas bort; det som har samma namn skrivs över. Förhandsgranska först.']],
  ['#/installningar/system', 'Inställningar · System', ['För global admin: kliniker (lägg upp, byt namn, radera, arbeta i) och anslutningen till DOPS.',
    'Att radera en klinik tar bort allt som hör till den och går inte att ångra. Du bekräftar genom att skriva klinikens namn. En klinik med ett globalt adminkonto kan inte raderas.']],
  ['#/installningar/anvandning', 'Inställningar · Användning', ['För global admin: hur ST-Lotsen och DOPS-appen används — personer, sessioner, sidvisningar, mest besökta sidor, enheter och webbläsare. ST-Lotsen samlar in sedan version 0.39.0; ingen IP-adress sparas.']],
  ['#/installningar/felanmalan', 'Inställningar · Felanmälan', ['För global admin: användarnas felanmälningar och fel som appen rapporterat automatiskt. Markera som hanterade när de är åtgärdade.']],
  ['#/installningar/anvandare', 'Inställningar · Användare', ['Alla användare och allt som gäller en person: klinikroller (admin, studierektor), yrkesroll, Opjour (bokar, reserv, statistik), DOPS (användarroll, koppling) och konto (PIN, inaktivera, slå ihop). Klicka på en person.', 'Med modulen DOPS påslagen: DOPS-konton — godkänn förslagen, koppla övriga för hand, hämta namn eller e-post från DOPS och skapa ST-Lotsen-konton för dem som bara finns i DOPS (tillfällig PIN visas en gång). Kliniken kopplas till DOPS av global admin.']]
];

function openHelp() {
  closeMenu();
  const hash = location.hash || '#/';
  const [, title, paras] = HELP.filter(([k]) => k === '#/' ? hash === '#/' || hash === '' : hash.startsWith(k))
    .sort((a, b) => b[0].length - a[0].length)[0] || ['', 'Hjälp', ['Ingen hjälptext för den här sidan än.']];
  el('sheet-root')?.remove();
  const root = document.createElement('div');
  root.id = 'sheet-root'; root.className = 'sp-overlay';
  root.innerHTML = `<aside class="sidepanel" role="dialog" aria-label="Hjälp">
    <div class="sp-head"><h2 style="margin:0">${esc(title)}</h2><button class="btn-ghost" onclick="el('sheet-root').remove()" aria-label="Stäng">✕</button></div>
    <div class="sp-body help">${paras.map(p => `<p>${p}</p>`).join('')}
      <p class="hint">Något som inte fungerar eller saknas? Använd <a href="#" onclick="el('sheet-root').remove();openFeedback(event)">felanmälan</a>.</p></div>
  </aside>`;
  root.addEventListener('click', e => { if (e.target === root) root.remove(); });
  document.body.appendChild(root);
  root.querySelector('.sidepanel').focus?.();
}

// ── Hjälp ("?" i sidhuvudet) ─────────────────────────────────────────────
// Klassiskt script. Beror på index.html: el(), esc(). Global entry: openHelp().
// Kort förklaring av sidan man står på (ui_forslag.md §8), i samma sidopanel som redigeringen. Texten väljs på längsta
// matchande början av adressen (#/st/krav före #/st).

const HELP = [
  ['#/', 'Idag', [
    'Det viktigaste från alla moduler på ett ställe: det du behöver ta hand om, dagens opjour och dina pass, din vecka i schemat, bemanningen och ditt förlopp.',
    'Korten syns bara om de gäller dig. Klicka på länken under ett kort för att gå vidare.']],
  ['#/kalender', 'Opjour · Kalender', [
    'Vem som har opjour vilken dag. Klicka på en dag för att se detaljer och boka eller släppa ditt pass.',
    'Passet byter person vid den tid kliniken har ställt in (Opjour → Inställningar).']],
  ['#/stats', 'Opjour · Statistik', ['Hur passen fördelas: per person, över tid och hur rättvis lottningen är.']],
  ['#/opjour-settings', 'Opjour · Inställningar', ['När passet byter person, vilka som räknas som reserv och i statistiken, och väggskärmar som visar dagens opjour.']],
  ['#/schema/installningar', 'Planering · Inställningar', [
    '<strong>Bemanning:</strong> minsta antal ST-läkare i tjänst. Veckor under gränsen blir röda i schemat och på startsidan.',
    '<strong>Aktivitetstyper:</strong> kodorden i schemat. De tre knapparna styr om en vecka med typen räknas som i tjänst, ej i tjänst eller inte påverkar. Klicka på en typ för att ändra namn, färg och om den <em>förlänger ST</em> (föräldra- och tjänstledighet skjuter fram beräknat ST-slut); dra (eller ↑↓ på mobil) för att ändra ordningen.']],
  ['#/schema', 'Planering · Veckoschema', [
    'En rad per ST-läkare, en kolumn per vecka. Klicka i en cell för att lägga in eller ändra en aktivitet. Dra över flera veckor i en rad för att lägga in en period.',
    'Raden "I tjänst" räknar hur många som är i tjänst varje vecka. Röd = under klinikens gräns.',
    'På mobil: välj <em>Jag</em> eller <em>Alla</em> för en lista per vecka.',
    '<strong>Importera jobbschema</strong> (studierektor): välj exporten från schemasystemet (.xlsx, en kolumn per dag). ST-läkarna matchas på namn, övriga läkare hoppas över. Du väljer vilka koder som blir vilken aktivitetstyp (t.ex. Randning → Rand, Föräldraledig → FL) och hur många dagar i veckan som krävs. Fynden granskas ett i taget: <em>Acceptera</em> sparar posten direkt, <em>Avvisa</em> hoppar över den; vid krock väljer du <em>Lägg till också</em> eller <em>Ersätt</em>. Det som redan finns i veckoschemat visas bara.']],
  ['#/oversikt', 'ST-utbildning · Måluppfyllelse', [
    'Alla ST-läkare mot klinikens krav. ✓ klart, ◷ bokat i schemat, ? förslag, ✎ plan, · ej gjort än, ! saknas (personen har passerat kravets ST-år). Peka på en ruta för hela texten, klicka för att ange status för hand.',
    'Klicka på en rubrik för att sortera: ST-läkare, ST-tid, % klart eller ett krav (de som gjort det först). Klicka igen för omvänd ordning. Filtrera på kategori och växla mellan kompakt och detaljerad vy.']],
  ['#/plan', 'Utbildningsplan', [
    '<strong>Översikt:</strong> förloppet per ST-år och kraven med status. <strong>Delmål:</strong> målbeskrivningens delmål med kopplade krav och hur många som är klara. <strong>Historik:</strong> ändringar i planen och status satt för hand. Ingen signering behövs — ST-läkaren håller själv koll, handledaren ser planen.',
    '<strong>Ändra planen:</strong> dra ett krav till ett annat år, eller klicka på det för att flytta eller ta bort det. Det gäller bara den här ST-läkarens plan — klinikens mall ändras inte. Ändringarna syns i Historik.',
    '<strong>Beräknat ST-slut</strong> är ST-start + 5 år + veckor med föräldra- eller tjänstledighet i veckoschemat.',
    '<strong>Skriv ut</strong> ger en A4 med översikt och delmål.']],
  ['#/bedomningar', 'ST-utbildning · Bedömningar', [
    'Bedömningarna från MoraDOPS (DOPS, Mini-CEX m.fl.), direkt ur MoraDOPS. Bara läsning — nya bedömningar görs i MoraDOPS som vanligt.',
    'Välj formulärtyp. Skalfrågor visas som kurva över tid med medelvärde (streckad linje), flervalsfrågor som fördelning, därefter fritextsvaren och varje bedömning.',
    'Du ser dina egna bedömningar. Den som är Studierektor eller Administratör i MoraDOPS väljer person och ser alla på kliniken.']],
  ['#/st/delmal', 'ST-utbildning · Delmål', ['Klinikens målbeskrivning och hur väl kraven täcker delmålen. Välj målbeskrivning i listan ovanför tabellen (t.ex. HSLF-FS 2021:8). <strong>Klicka på ett delmål</strong> för att välja vilka krav som räknas till det; det går också från ett krav under fliken Krav.']],
  ['#/st/personer', 'ST-utbildning · ST-läkare och handledare', ['Vem som är ST-läkare, ST-start och -slut, målbeskrivning och handledare. Studierektorsrollen sätts under Administration.']],
  ['#/st', 'ST-utbildning · Krav', [
    'Klinikens mall: det som ska uppnås, per ST-år. ST-läkarna ser samma vy i sin utbildningsplan.',
    '<strong>Dra</strong> ett krav till ett annat år, <strong>klicka</strong> för att ändra det (delmål, randning, längd, i tjänst).']],
  ['#/settings', 'Mitt konto', ['Ditt namn, användarnamn, telefon och PIN.']],
  ['#/admin', 'Administration', ['Användare (sök, filtrera, klicka för roller och uppgifter), moduler för kliniken och felrapporter.', 'Med modulen MoraDOPS påslagen: MoraDOPS-konton — godkänn förslagen, koppla övriga för hand, hämta namn eller e-post från MoraDOPS och skapa ST-Lotsen-konton för dem som bara finns i MoraDOPS (tillfällig PIN visas en gång). Kliniken kopplas till MoraDOPS av global admin.']]
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

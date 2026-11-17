// Lädt Straßen, Stoppschilder & Co. für das Tegernseer Tal aus OpenStreetMap
// und speichert die fertig ausgewerteten Punkte in data.json.
// Läuft automatisch über GitHub Actions (.github/workflows/fahrhilfe-daten.yml).
const fs = require('fs');
const path = require('path');
const Core = require('./core.js');

// Kreuth/Glashütte (Süd) bis Moosrain (Nord), Bad Wiessee (West) bis Hausham (Ost)
const BOX = [47.580, 11.650, 47.800, 11.890];
const AREA = 'Tegernseer Tal + Hausham';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchOsm() {
  const q = Core.query(...BOX);
  let lastErr;
  for (let round = 0; round < 3; round++) {
    for (const url of ENDPOINTS) {
      try {
        console.log('Frage', url, 'an …');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'fahrhilfe-tegernsee (github.com/braunleingeorg/bergbauerbuam)' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(180000),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (!json.elements || json.elements.length < 1000) throw new Error('zu wenige Elemente: ' + (json.elements || []).length);
        return json;
      } catch (e) {
        lastErr = e;
        console.log('  fehlgeschlagen:', e.message);
      }
    }
    await new Promise(r => setTimeout(r, 20000));
  }
  throw lastErr;
}

(async () => {
  const osm = await fetchOsm();
  const pois = Core.process(osm).map(p => ({
    t: p.t,
    lat: Math.round(p.lat * 1e6) / 1e6,
    lon: Math.round(p.lon * 1e6) / 1e6,
    a: p.a,
  }));
  const count = { stop: 0, rvl: 0, yield: 0 };
  pois.forEach(p => count[p.t]++);
  console.log('Ergebnis:', count);
  if (count.stop < 5 || count.rvl < 20) throw new Error('Unplausibel wenige Punkte – data.json wird nicht überschrieben');
  const out = { time: Date.now(), area: AREA, box: BOX, count, pois };
  fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });

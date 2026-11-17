/* ===================== CORE (Geometrie + OSM-Auswertung) ===================== */
const Core = (() => {
  const R = 6371000, rad = x => x * Math.PI / 180, deg = x => x * 180 / Math.PI;
  function dist(a, b) {
    const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const la1 = rad(a[0]), la2 = rad(b[0]), dl = rad(b[1] - a[1]);
    const y = Math.sin(dl) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function angDiff(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  const MINOR = new Set(['residential', 'unclassified', 'living_street']);
  const CONTROL = new Set(['stop', 'give_way', 'traffic_signals', 'mini_roundabout']);
  const ROAD_RE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$';

  function query(s, w, n, e) {
    const bb = `${s},${w},${n},${e}`;
    return `[out:json][timeout:120];
way["highway"~"${ROAD_RE}"](${bb})->.w;
.w out body;
.w >->.n;
.n out skel qt;
node["highway"~"^(stop|give_way|traffic_signals|mini_roundabout)$"](${bb});
out body;`;
  }

  function process(data) {
    const nodes = new Map(), tagged = [], ways = [];
    for (const el of data.elements) {
      if (el.type === 'node') {
        nodes.set(el.id, [el.lat, el.lon]);
        if (el.tags && el.tags.highway) tagged.push(el);
      } else if (el.type === 'way' && el.nodes && el.nodes.length > 1) ways.push(el);
    }
    const arms = new Map(), nodeWays = new Map();
    const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); };
    for (const w of ways) {
      const t = w.tags || {};
      w.cls = t.highway || '';
      w.round = t.junction === 'roundabout' || t.junction === 'circular';
      w.prio = t.priority_road === 'designated' || t.priority_road === 'yes_unposted';
      const ns = w.nodes;
      for (let i = 0; i < ns.length; i++) {
        push(nodeWays, ns[i], { w, i });
        if (i > 0) push(arms, ns[i], { w, i, dir: -1 });
        if (i < ns.length - 1) push(arms, ns[i], { w, i, dir: 1 });
      }
    }
    const armCache = new Map();
    function uniqArms(id) {
      if (armCache.has(id)) return armCache.get(id);
      const out = [], seen = new Set();
      for (const a of arms.get(id) || []) {
        const nb = a.w.nodes[a.i + a.dir];
        if (nb === id || seen.has(nb)) continue;
        seen.add(nb); out.push(a);
      }
      armCache.set(id, out);
      return out;
    }
    const isJunction = id => uniqArms(id).length >= 3;

    // Punkt ca. `target` Meter vom Knoten i entlang des Wegs in Richtung dir
    function walk(w, i, dir, target) {
      const ns = w.nodes; let acc = 0, prev = nodes.get(ns[i]), j = i + dir;
      while (j >= 0 && j < ns.length) {
        const p = nodes.get(ns[j]); if (!p) break;
        const d = dist(prev, p);
        if (d > 0 && acc + d >= target) { const f = (target - acc) / d; return [prev[0] + (p[0] - prev[0]) * f, prev[1] + (p[1] - prev[1]) * f]; }
        acc += d; prev = p; j += dir;
      }
      return prev;
    }
    function distToJunction(w, i, dir, max) {
      const ns = w.nodes; let acc = 0, prev = nodes.get(ns[i]), j = i + dir;
      while (j >= 0 && j < ns.length) {
        const p = nodes.get(ns[j]); if (!p) return null;
        acc += dist(prev, p); if (acc > max) return null;
        if (isJunction(ns[j])) return acc;
        prev = p; j += dir;
      }
      return null;
    }
    // Fahrtrichtung, mit der man über den Arm auf den Knoten zufährt
    function approachBearing(w, i, fromDir) {
      const p = nodes.get(w.nodes[i]);
      const back = walk(w, i, fromDir, 20);
      if (dist(back, p) < 2) return null;
      return bearing(back, p);
    }

    const controls = tagged.filter(t => CONTROL.has(t.tags.highway)).map(t => [t.lat, t.lon, t.id]);
    function controlNear(p, r) {
      const dLat = r / 111000;
      for (const c of controls) {
        if (Math.abs(c[0] - p[0]) > dLat) continue;
        if (dist(p, c) <= r) return true;
      }
      return false;
    }

    const pois = [];
    // 1) Rechts-vor-links-Kandidaten
    for (const [id] of arms) {
      const ua = uniqArms(id);
      if (ua.length < 3) continue;
      if (!ua.every(a => MINOR.has(a.w.cls) && !a.w.round && !a.w.prio)) continue;
      const p = nodes.get(id); if (!p) continue;
      if (controlNear(p, 30)) continue;
      const a = [];
      for (const arm of ua) { const b = approachBearing(arm.w, arm.i, arm.dir); if (b != null) a.push(Math.round(b)); }
      pois.push({ t: 'rvl', lat: p[0], lon: p[1], a });
    }
    // 2) Stopp- und Vorfahrt-achten-Schilder
    for (const tn of tagged) {
      const hw = tn.tags.highway;
      if (hw !== 'stop' && hw !== 'give_way') continue;
      const p = [tn.lat, tn.lon];
      const dirTag = String(tn.tags.direction || '').toLowerCase();
      const a = [];
      for (const { w, i } of nodeWays.get(tn.id) || []) {
        if (isJunction(tn.id)) {
          // Schild direkt auf dem Kreuzungsknoten: alle Zufahrten auf Nebenstraßen-Niveau
          for (const arm of uniqArms(tn.id)) { const b = approachBearing(arm.w, arm.i, arm.dir); if (b != null) a.push(Math.round(b)); }
          break;
        }
        let travel = 0;
        if (dirTag === 'forward') travel = 1;
        else if (dirTag === 'backward') travel = -1;
        else {
          const df = distToJunction(w, i, 1, 80), db = distToJunction(w, i, -1, 80);
          if (df != null || db != null) travel = (db == null || (df != null && df <= db)) ? 1 : -1;
        }
        const dirs = travel ? [travel] : [1, -1];
        for (const tr of dirs) {
          let b = approachBearing(w, i, -tr);
          if (b == null) { const ahead = walk(w, i, tr, 20); if (dist(p, ahead) >= 2) b = bearing(p, ahead); }
          if (b != null) a.push(Math.round(b));
        }
      }
      pois.push({ t: hw === 'stop' ? 'stop' : 'yield', lat: p[0], lon: p[1], a });
    }
    return pois;
  }

  // Entscheidet, ob ein Punkt gerade gemeldet werden soll
  function check(poi, cur, heading, speed, leadSec) {
    const pp = [poi.lat, poi.lon];
    const d = dist(cur, pp);
    const dAlert = Math.max(30, Math.min(150, speed * leadSec));
    const bt = bearing(cur, pp);
    const th = rad(angDiff(bt, heading));
    const along = d * Math.cos(th), lateral = Math.abs(d * Math.sin(th));
    const ahead = along > 3 && lateral <= Math.max(15, d * 0.25);
    const dirOk = !poi.a.length || poi.a.some(b => angDiff(b, heading) <= 45);
    return { d, ahead: ahead && dirOk, alert: ahead && dirOk && d <= dAlert };
  }

  // ---------- Tempolimits ----------
  function parseMaxspeed(t, cls) {
    const raw = t.maxspeed || t['maxspeed:forward'] || t['zone:maxspeed'] || t['maxspeed:type'] || t['source:maxspeed'];
    if (!raw) return cls === 'living_street' ? 10 : null;
    const v = String(raw).trim();
    if (/^\d+$/.test(v)) return +v;
    let m = v.match(/^(\d+)\s*mph$/i); if (m) return Math.round(+m[1] * 1.609);
    if (/walk/i.test(v) || /living_street/i.test(v)) return 10;
    if (/DE:urban/i.test(v)) return 50;
    if (/DE:rural/i.test(v)) return 100;
    if (/none|motorway/i.test(v)) return null;
    m = v.match(/(\d+)/); return m ? +m[1] : null;
  }
  // Liefert Straßenstücke mit Tempolimit: [{v: 50, c: [lat,lon,lat,lon,...]}]
  function speedSegments(data) {
    const nodes = new Map(), out = [];
    for (const el of data.elements) if (el.type === 'node') nodes.set(el.id, [el.lat, el.lon]);
    for (const el of data.elements) {
      if (el.type !== 'way' || !el.tags || !el.nodes) continue;
      const v = parseMaxspeed(el.tags, el.tags.highway);
      if (!v || v < 5 || v > 130) continue;
      const c = [];
      for (const id of el.nodes) { const p = nodes.get(id); if (p) c.push(Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5); }
      if (c.length >= 4) out.push({ v, c });
    }
    return out;
  }
  // Abstand Punkt–Strecke in Metern (lokal flach gerechnet, reicht für < 1 km)
  function segDist(p, a, b) {
    const k = Math.cos(rad(p[0])) * 111320, ky = 110540;
    const ax = (a[1] - p[1]) * k, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * k, by = (b[0] - p[0]) * ky;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy;
    return Math.sqrt(x * x + y * y);
  }

  return { dist, bearing, angDiff, query, process, check, parseMaxspeed, speedSegments, segDist };
})();
if (typeof module !== 'undefined') module.exports = Core;

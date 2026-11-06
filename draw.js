/* Bergbauerbuam – Mal-Battle: alle zeichnen gleichzeitig auf ihrem Handy, dann wird abgestimmt */
window.BBB_DRAW = function (api) {
  "use strict";
  const { S, sb, esc, avatar, player, activePlayers, render, buzz, shuffle, pick, toast, rpc, isAdmin, currentEvening } = api;
  const safeImg = (s) => (/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(s || "") ? s : "");

  // ---------- Themen ----------
  const PROMPTS = {
    bier: [
      "Ein Maßkrug mit Gefühlen", "Der perfekte Kasten Bier", "Ein Bier, das einen Menschen trinkt", "Der Kater am Sonntagmorgen",
      "Ein Wiesn-Zelt um 23 Uhr", "Bier im Weltall", "Ein Radler, das sich schämt", "Der Türsteher vom Club", "Ein Bier-Superheld",
      "Eine Kuh, die Bier zapft", "Ein Bergbauer mit Sixpack aus Dosen", "Der Heimweg um 4 Uhr", "Ein Kotzer in Zeitlupe",
      "Weißwurst-Frühstück nach der Party", "Die Lederhose nach dem Abend", "Ein Traktor auf Party", "Der leere Kühlschrank",
      "Ein Bierbauch-Weltmeister", "Die Brauerei der Zukunft", "Ein Schaf beim Exen", "Ein Berg aus Bierkästen", "Der letzte Bus",
    ],
    crew: [
      "{A} nach dem dritten Kotzer", "{A} als Bürgermeister", "{A} um 4 Uhr früh", "{A} im Club", "{A} beim Exen", "{A} als Baby",
      "{A} in 30 Jahren", "{A} und {B} auf dem Heimweg", "{A} als Tier", "{A} beim Schuhplattln", "Das ehrliche Profilbild von {A}",
      "{A} als Superheld", "{A} am Morgen danach", "{A} beim Date", "{A} als Bergbauer", "{A} im Gym", "{A} wenn das Bier leer ist",
    ],
    pimmel: [
      "Ein Pimmel in Lederhose", "Der Pimmel nach der 5. Halben", "Ein Pimmel als Superheld", "Ein Pimmel beim Skifahren",
      "Ein Pimmel-Denkmal am Marienplatz", "Ein Pimmel, der Bier ext", "Ein Pimmel mit Sonnenbrand", "Ein Pimmel im Gym",
      "Das Pimmel-Wappen der Bergbauerbuam", "Ein Pimmel auf dem Traktor", "Ein Pimmel im Winter", "Ein Pimmel als Bierkrug",
      "Ein Pimmel-Ritter mit Schwert", "Ein schüchterner Pimmel", "Ein Pimmel mit Schnurrbart", "Ein Pimmel bei der Mondlandung",
      "Ein Pimmel als Schneemann", "Ein Pimmel beim Bergsteigen", "Der Pimmel von {A}, als Kunstwerk",
    ],
  };
  const CATS = [
    { id: "bier", label: "🍺 Bier & Bayern" },
    { id: "crew", label: "🤠 Crew-Roast" },
    { id: "pimmel", label: "🍆 Pimmel", pimmel: true },
    { id: "mix", label: "🎲 Gemischt" },
  ];
  const COLORS = ["#1a1a1a", "#ffffff", "#ef5b5b", "#f2b632", "#5fcf8a", "#6aa6ec", "#e8a598", "#8b5a2b", "#c58cf2"];
  const SIZES = [4, 10, 24];
  const GRACE = 5, VOTE = 40;

  // ---------- Zustand ----------
  const D = {
    rounds: [], drawings: [], votes: [], offset: 0,
    cat: "bier", dur: 30, color: COLORS[0], size: SIZES[1],
    canvas: null, strokes: [], cur: null, submitted: {}, submitting: false,
    tick: null, lastPhase: null, gallery: null, galleryLoading: false,
  };
  const now = () => Date.now() + D.offset;
  const t = (iso) => new Date(iso).getTime();

  // ---------- Daten ----------
  async function syncClock() {
    try {
      const t0 = Date.now();
      const { data } = await sb.rpc("bbb_now");
      if (data) D.offset = t(data) - (t0 + Date.now()) / 2;
    } catch {}
  }
  let loadT = null, loading = false;
  async function load() {
    if (loading) { load.again = true; return; }
    loading = true;
    try {
      const { data: rounds, error } = await sb.from("draw_rounds").select("*").order("started_at", { ascending: false }).limit(30);
      if (error) throw error;
      D.rounds = rounds || [];
      const r = D.rounds[0];
      if (r && now() - t(r.started_at) < 60 * 60 * 1000) {
        const [{ data: dr }, { data: vs }] = await Promise.all([
          sb.from("drawings").select("*").eq("round_id", r.id),
          sb.from("draw_votes").select("*").eq("round_id", r.id),
        ]);
        D.drawings = dr || []; D.votes = vs || [];
      } else { D.drawings = []; D.votes = []; }
      D.ready = true;
    } catch (e) { console.warn("Mal-Battle:", e); D.ready = false; }
    loading = false;
    if (load.again) { load.again = false; return load(); }
    render();
  }
  const scheduleLoad = () => { clearTimeout(loadT); loadT = setTimeout(load, 250); };

  // ---------- Runde & Phase ----------
  function current() {
    const r = D.rounds[0];
    if (!r || r.id === D.dismissed) return null;
    return now() - t(r.started_at) < 30 * 60 * 1000 ? r : null;
  }
  function phase(r) {
    if (!r) return "lobby";
    const n = now(), end = t(r.started_at) + r.duration * 1000;
    if (n < end && drawers(r).length < Math.max(2, activeIds().length)) return "draw";
    if (n < end + GRACE * 1000 && drawers(r).length < activeIds().length) return "collect";
    const drawn = drawers(r);
    const allVoted = drawn.length > 1 && drawn.every((id) => ["best", "worst"].every((c) => D.votes.some((v) => v.voter_id === id && v.category === c)));
    if (drawn.length < 2) return n < end + GRACE * 1000 ? "collect" : "results";
    if (!allVoted && n < end + (GRACE + VOTE) * 1000) return "vote";
    return "results";
  }
  const activeIds = () => activePlayers().map((p) => p.id);
  const drawers = (r) => D.drawings.filter((d) => d.round_id === r.id).map((d) => d.player_id);
  const secsLeft = (r, ph) => {
    const end = t(r.started_at) + r.duration * 1000;
    const target = ph === "draw" ? end : ph === "vote" ? end + (GRACE + VOTE) * 1000 : end + GRACE * 1000;
    return Math.max(0, Math.ceil((target - now()) / 1000));
  };
  function fillPrompt(txt) {
    const ns = shuffle(activePlayers().map((p) => p.name));
    return txt.replaceAll("{A}", ns[0] || "Georg").replaceAll("{B}", ns[1] || ns[0] || "Hansi");
  }
  async function startRound() {
    let cat = D.cat;
    if (cat === "mix") cat = pick(S.pimmel ? ["bier", "crew", "pimmel"] : ["bier", "crew"]);
    if (cat === "pimmel" && !S.pimmel) cat = "bier";
    const prompt = fillPrompt(pick(PROMPTS[cat]));
    resetCanvas();
    const ev = currentEvening();
    const { data, error } = await sb.from("draw_rounds").insert({ prompt, category: cat, duration: D.dur, created_by: S.me, evening_id: ev?.id || null }).select().single();
    if (error) return toast("Runde konnte nicht starten: " + error.message);
    D.rounds.unshift(data); D.drawings = []; D.votes = [];
    try { await sb.from("messages").insert({ evening_id: ev?.id || null, player_id: S.me, body: `🎨 Mal-Battle gestartet: „${prompt}“! Alle unter Spiele → Mal-Battle mitmachen, ${D.dur} Sekunden!` }); } catch {}
    buzz(60);
    render();
  }

  // ---------- Leinwand ----------
  function ensureCanvas() {
    if (D.canvas) return D.canvas;
    const c = document.createElement("canvas");
    c.width = 600; c.height = 600; c.className = "draw-canvas";
    const ctx = c.getContext("2d");
    const pos = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
    c.addEventListener("pointerdown", (e) => {
      if (!canDraw()) return;
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      D.cur = { color: D.color, size: D.size * 1.5, pts: [pos(e)] };
      D.strokes.push(D.cur); drawStroke(ctx, D.cur, true);
    });
    c.addEventListener("pointermove", (e) => {
      if (!D.cur) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach((ce) => D.cur.pts.push(pos(ce)));
      drawStroke(ctx, D.cur, false);
    });
    const end = () => { D.cur = null; };
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    D.canvas = c;
    redraw();
    return c;
  }
  function drawStroke(ctx, s, full) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const p = s.pts;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], s.size / 2, 0, Math.PI * 2); ctx.fill(); return; }
    const from = full ? 0 : Math.max(0, p.length - 3);
    ctx.beginPath(); ctx.moveTo(p[from][0], p[from][1]);
    for (let i = from + 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }
  function redraw() {
    if (!D.canvas) return;
    const ctx = D.canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 600, 600);
    D.strokes.forEach((s) => drawStroke(ctx, s, true));
  }
  function resetCanvas() { D.strokes = []; D.cur = null; redraw(); }
  function canDraw() { const r = current(); return r && phase(r) === "draw" && !D.submitted[r.id] && !myDrawing(r); }
  const myDrawing = (r) => D.drawings.find((d) => d.round_id === r.id && d.player_id === S.me);
  async function submit(auto) {
    const r = current();
    if (!r || D.submitting || D.submitted[r.id] || myDrawing(r)) return;
    if (!D.strokes.length) { if (!auto) toast("Mal erst was 😄"); return; }
    D.submitting = true;
    const image = D.canvas.toDataURL("image/jpeg", 0.72);
    const { data, error } = await sb.from("drawings").insert({ round_id: r.id, player_id: S.me, image }).select().single();
    D.submitting = false;
    if (error) { toast("Abgeben hat nicht geklappt: " + error.message); return; }
    D.submitted[r.id] = true; D.drawings.push(data); buzz(40);
    render();
  }

  // ---------- Abstimmen ----------
  async function vote(drawingId, cat) {
    const r = current();
    const d = D.drawings.find((x) => x.id === drawingId);
    if (!r || !d || d.player_id === S.me) return;
    const mine = D.votes.find((v) => v.round_id === r.id && v.voter_id === S.me && v.category === cat);
    buzz();
    if (mine) {
      mine.drawing_id = drawingId; render();
      const { error } = await sb.from("draw_votes").update({ drawing_id: drawingId }).eq("id", mine.id);
      if (error) toast(error.message);
    } else {
      const { data, error } = await sb.from("draw_votes").insert({ round_id: r.id, voter_id: S.me, drawing_id: drawingId, category: cat }).select().single();
      if (error) return toast(error.message);
      D.votes.push(data); render();
    }
  }
  function tally(roundDrawings, votes) {
    return roundDrawings.map((d) => ({
      d, p: player(d.player_id),
      best: votes.filter((v) => v.drawing_id === d.id && v.category === "best").length,
      worst: votes.filter((v) => v.drawing_id === d.id && v.category === "worst").length,
    }));
  }
  // stabile, für jeden gleiche Reihenfolge, die nicht nach Spielern sortiert ist
  const hash = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };

  // ---------- Galerie der Schande ----------
  async function loadGallery() {
    D.galleryLoading = true; render();
    try {
      const done = D.rounds.filter((r) => phase(r) === "results" || r !== D.rounds[0]).slice(0, 12);
      const ids = done.map((r) => r.id);
      if (!ids.length) { D.gallery = []; return; }
      const [{ data: dr }, { data: vs }] = await Promise.all([
        sb.from("drawings").select("*").in("round_id", ids),
        sb.from("draw_votes").select("*").in("round_id", ids),
      ]);
      D.gallery = done.map((r) => {
        const tl = tally((dr || []).filter((d) => d.round_id === r.id), (vs || []).filter((v) => v.round_id === r.id));
        if (!tl.length) return null;
        const best = tl.slice().sort((a, b) => b.best - a.best)[0];
        const worst = tl.slice().sort((a, b) => b.worst - a.worst)[0];
        return { r, best, worst: worst && worst.worst > 0 && worst !== best ? worst : null, all: tl };
      }).filter(Boolean);
    } catch (e) { toast("Galerie konnte nicht laden"); }
    finally { D.galleryLoading = false; render(); }
  }

  // ---------- Ansichten ----------
  function view() {
    if (!D.ready) return `<div class="card"><div class="empty">Mal-Battle wird geladen … Falls das so bleibt, fehlt noch das Datenbank-Update.</div></div>`;
    const r = current();
    const ph = phase(r);
    D.lastPhase = ph;
    if (ph === "lobby") return viewLobby();
    const head = `<div class="draw-head"><span class="prompt-pre">${{ draw: "Zeichne", collect: "Bilder kommen …", vote: "Abstimmung", results: "Ergebnis" }[ph]}</span><div class="draw-prompt">${esc(r.prompt)}</div>${ph !== "results" ? `<div class="draw-timer num" id="draw-timer">${secsLeft(r, ph)}</div>` : ""}</div>`;
    if (ph === "draw") return head + viewDraw(r);
    if (ph === "collect") return head + `<div class="card game-stage"><div class="rule"><b>Stifte weg! ✋</b><span class="muted">${drawers(r).length} Bilder abgegeben …</span></div></div>`;
    if (ph === "vote") return head + viewVote(r);
    return head + viewResults(r);
  }
  function viewLobby() {
    const cats = CATS.filter((c) => !c.pimmel || S.pimmel);
    if (!cats.find((c) => c.id === D.cat)) D.cat = "bier";
    return `
      <div class="card game-stage">
        <div class="muted" style="text-align:center">Alle machen auf ihrem eigenen Handy <b>Spiele → Mal-Battle</b> auf. Einer startet, dann zeichnen alle gleichzeitig das gleiche Thema. Danach wird anonym abgestimmt: Das beste Bild verteilt 3 Schluck, das schlechteste trinkt 2.</div>
        <div class="field"><label>Themen</label><div class="chips">${cats.map((c) => `<button class="chip plain ${D.cat === c.id ? "on" : ""}" data-act="draw-cat" data-c="${c.id}">${c.label}</button>`).join("")}</div></div>
        <div class="field"><label>Zeit</label><div class="seg">${[30, 45, 60].map((s) => `<button class="${D.dur === s ? "on" : ""}" data-act="draw-dur" data-s="${s}">${s} Sek.</button>`).join("")}</div></div>
        <button class="btn gold block" data-act="draw-start">🎨 Runde für alle starten</button>
      </div>
      ${viewGallery()}`;
  }
  function viewDraw(r) {
    if (myDrawing(r) || D.submitted[r.id]) {
      const n = drawers(r).length;
      return `<div class="card game-stage"><div class="rule"><b>Abgegeben ✓</b><span class="muted">${n} von ${activePlayers().length} sind fertig. Gleich wird abgestimmt.</span></div></div>`;
    }
    return `
      <div class="draw-wrap"><div id="draw-mount" class="draw-mount"></div></div>
      <div class="draw-tools">
        <div class="draw-colors">${COLORS.map((c) => `<button class="dcol ${D.color === c ? "on" : ""}" data-act="draw-color" data-c="${c}" style="background:${c}" aria-label="Farbe"></button>`).join("")}</div>
        <div class="row">
          ${SIZES.map((s) => `<button class="btn sm ${D.size === s ? "gold" : "ghost"}" data-act="draw-size" data-s="${s}" aria-label="Pinsel ${s}"><span class="dsize" style="width:${s}px;height:${s}px"></span></button>`).join("")}
          <button class="btn sm ghost" data-act="draw-undo">↶</button>
          <button class="btn sm ghost" data-act="draw-clear">🗑️</button>
        </div>
        <button class="btn gold block" data-act="draw-submit">Fertig ✓</button>
      </div>`;
  }
  function viewVote(r) {
    const list = D.drawings.filter((d) => d.round_id === r.id).sort((a, b) => hash(a.id) - hash(b.id));
    const my = (c) => D.votes.find((v) => v.voter_id === S.me && v.category === c)?.drawing_id;
    const voted = D.votes.filter((v) => v.category === "best").length;
    return `
      <div class="muted small" style="text-align:center">Wähl das <b>beste</b> 🏆 und das <b>schlechteste</b> 🍺 Bild. Deins kannst du nicht wählen. ${voted}/${list.length} haben abgestimmt.</div>
      <div class="draw-grid">${list.map((d, i) => {
        const own = d.player_id === S.me;
        return `<div class="draw-card ${own ? "own" : ""} ${my("best") === d.id ? "is-best" : ""} ${my("worst") === d.id ? "is-worst" : ""}">
          <img src="${safeImg(d.image)}" alt="Bild ${i + 1}">
          <div class="draw-card-bar">${own ? `<span class="muted small">Dein Bild</span>` : `
            <button class="vbtn ${my("best") === d.id ? "on" : ""}" data-act="draw-vote" data-id="${d.id}" data-c="best">🏆</button>
            <span class="muted small">#${i + 1}</span>
            <button class="vbtn worst ${my("worst") === d.id ? "on" : ""}" data-act="draw-vote" data-id="${d.id}" data-c="worst">🍺</button>`}</div>
        </div>`;
      }).join("")}</div>`;
  }
  function viewResults(r) {
    const tl = tally(D.drawings.filter((d) => d.round_id === r.id), D.votes.filter((v) => v.round_id === r.id)).sort((a, b) => b.best - a.best || a.worst - b.worst);
    if (!tl.length) return `<div class="card game-stage"><div class="rule"><b>Keiner hat was gemalt 🙈</b></div><button class="btn gold block" data-act="draw-new">Neue Runde</button></div>`;
    const maxB = Math.max(...tl.map((x) => x.best)), maxW = Math.max(...tl.map((x) => x.worst));
    const winners = tl.filter((x) => maxB > 0 && x.best === maxB), losers = tl.filter((x) => maxW > 0 && x.worst === maxW);
    return `
      <div class="card game-stage">
        ${winners.length ? `<div class="rule ok"><b>🏆 ${winners.map((x) => esc(x.p?.name)).join(" & ")}</b><span>Picasso der Runde, verteil 3 Schluck!</span></div>` : ""}
        ${losers.length ? `<div class="rule bad"><b>🍺 ${losers.map((x) => esc(x.p?.name)).join(" & ")}</b><span>Schlechtestes Bild, trink 2!</span></div>` : ""}
      </div>
      <div class="draw-grid">${tl.map((x) => `<div class="draw-card ${winners.includes(x) ? "is-best" : ""} ${losers.includes(x) ? "is-worst" : ""}">
        <img src="${safeImg(x.d.image)}" alt="Bild von ${esc(x.p?.name)}">
        <div class="draw-card-bar">${avatar(x.p, 22)}<b class="small" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.p?.name)}</b>${isAdmin() || x.d.player_id === S.me ? `<button class="icon-btn" data-act="draw-del" data-id="${x.d.id}" aria-label="Bild löschen">✕</button>` : ""}</div>
        <div class="draw-card-bar score"><span>🏆 ${x.best}</span><span>🍺 ${x.worst}</span></div>
      </div>`).join("")}</div>
      <button class="btn gold block" data-act="draw-new">🎨 Nächste Runde</button>`;
  }
  function viewGallery() {
    if (!D.gallery) return `<button class="btn ghost block" data-act="draw-gallery" ${D.galleryLoading ? "disabled" : ""}>🖼️ ${D.galleryLoading ? "Lädt …" : "Galerie der Schande ansehen"}</button>`;
    if (!D.gallery.length) return `<div class="card"><h3>🖼️ Galerie der Schande</h3><div class="empty">Noch keine fertigen Runden.</div></div>`;
    return `<div class="section"><h3>🖼️ Galerie der Schande</h3>${D.gallery.map((g) => `
      <div class="card section">
        <div><b>${esc(g.r.prompt)}</b><div class="muted small">${new Date(g.r.started_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" })} · ${g.all.length} Bilder</div></div>
        <div class="draw-grid">
          <div class="draw-card is-best"><img src="${safeImg(g.best.d.image)}" alt=""><div class="draw-card-bar"><span class="small">🏆 ${esc(g.best.p?.name)}</span></div></div>
          ${g.worst ? `<div class="draw-card is-worst"><img src="${safeImg(g.worst.d.image)}" alt=""><div class="draw-card-bar"><span class="small">🍺 ${esc(g.worst.p?.name)}</span></div></div>` : ""}
        </div>
      </div>`).join("")}</div>`;
  }

  function after() {
    const m = document.getElementById("draw-mount");
    if (m) { m.appendChild(ensureCanvas()); }
    if (!D.tick) {
      D.tick = setInterval(() => {
        if (S.game !== "malen") return;
        const r = current(), ph = phase(r);
        const el = document.getElementById("draw-timer");
        if (el && r) { const s = secsLeft(r, ph); el.textContent = s; el.classList.toggle("hurry", ph === "draw" && s <= 5); }
        if (ph !== D.lastPhase) {
          if (D.lastPhase === "draw" && r && !D.submitted[r.id]) submit(true);
          if (ph === "vote" || ph === "results") buzz(80);
          render();
        }
      }, 250);
    }
  }
  function stop() { if (D.tick) clearInterval(D.tick); D.tick = null; }
  function banner() {
    const r = current();
    if (!r || S.game === "malen") return "";
    const ph = phase(r);
    if (ph === "draw" && !myDrawing(r)) return `<button class="draw-banner" data-act="draw-join">🎨 Mal-Battle läuft: „${esc(r.prompt)}“ · noch ${secsLeft(r, ph)} s · <b>Mitmachen</b></button>`;
    if (ph === "vote") return `<button class="draw-banner" data-act="draw-join">🗳️ Mal-Battle: Jetzt abstimmen!</button>`;
    return "";
  }

  // ---------- Start ----------
  syncClock().then(load);
  sb.channel("malen")
    .on("postgres_changes", { event: "*", schema: "public", table: "draw_rounds" }, () => { scheduleLoad(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "drawings" }, scheduleLoad)
    .on("postgres_changes", { event: "*", schema: "public", table: "draw_votes" }, scheduleLoad)
    .subscribe();
  setInterval(() => { if (document.visibilityState === "visible") { load(); if (S.tab !== "spiele" || S.game !== "malen") render(); } }, 15000);

  const game = { id: "malen", cat: "party", name: "Mal-Battle", emoji: "🎨", desc: "Alle zeichnen gleichzeitig auf dem Handy, dann wird abgestimmt.", view, after };
  const actions = {
    "draw-cat": (el) => { D.cat = el.dataset.c; render(); },
    "draw-dur": (el) => { D.dur = +el.dataset.s; render(); },
    "draw-start": startRound,
    "draw-new": () => { D.gallery = null; resetCanvas(); D.dismissed = D.rounds[0]?.id; render(); },
    "draw-color": (el) => { D.color = el.dataset.c; render(); },
    "draw-size": (el) => { D.size = +el.dataset.s; render(); },
    "draw-undo": () => { D.strokes.pop(); redraw(); },
    "draw-clear": () => resetCanvas(),
    "draw-submit": () => submit(false),
    "draw-vote": (el) => vote(el.dataset.id, el.dataset.c),
    "draw-gallery": loadGallery,
    "draw-del": async (el) => { const id = el.dataset.id; D.drawings = D.drawings.filter((d) => d.id !== id); render(); try { await rpc("bbb_delete", { p_table: "drawings", p_id: id }); } catch {} load(); },
    "draw-join": () => { S.tab = "spiele"; S.game = "malen"; S.g = {}; render(); window.scrollTo(0, 0); },
  };
  return { game, actions, banner, stop };
};

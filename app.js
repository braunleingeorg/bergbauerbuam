/* Bergbauerbuam – die App für unsere Abende */
(() => {
  "use strict";

  // ---------- Konfiguration ----------
  const DRINKS = {
    helles:    { label: "Helles",    size: "0,33", liters: 0.33, emoji: "🍺", chug: true },
    halbe:     { label: "Halbe",     size: "0,5",  liters: 0.5,  emoji: "🍻", chug: true },
    longdrink: { label: "Longdrink", size: "0,3",  liters: 0.3,  emoji: "🍹", chug: true },
    shot:      { label: "Shot",      size: "2 cl", liters: 0.02, emoji: "🥃", chug: false },
  };
  const DRINK_KEYS = Object.keys(DRINKS);
  const CHUG_KEYS = DRINK_KEYS.filter((k) => DRINKS[k].chug);
  const VOTE_CATS = [
    { id: "vollster", label: "Der Vollste", emoji: "🥴" },
    { id: "mvp", label: "MVP", emoji: "👑" },
    { id: "lvp", label: "LVP", emoji: "🪦" },
  ];
  const COLORS = ["#f2b632", "#6aa6ec", "#ef5b5b", "#5fcf8a", "#c58cf2", "#f28f4b", "#4fd1c5", "#f06fb0"];

  const cfg = window.BBB_CONFIG || {};
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  // ---------- Zustand ----------
  const S = {
    tab: "abend",
    players: [], evenings: [], drinks: [], chugs: [], departures: [], pukes: [], votes: [],
    loaded: false, error: null,
    me: store.get("bbb_me"),
    watch: { player: store.get("bbb_watch_player"), kind: store.get("bbb_watch_kind") || "halbe", running: false, start: 0, elapsed: 0, result: null, raf: 0 },
    rankKind: "halbe",
  };

  // ---------- Helfer ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const player = (id) => byId(S.players, id);
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso, o) => new Date(iso).toLocaleDateString("de-DE", o || { weekday: "short", day: "numeric", month: "short" });
  const fmtMs = (ms) => {
    const s = ms / 1000;
    if (s < 60) return s.toFixed(2).replace(".", ",") + " s";
    const m = Math.floor(s / 60);
    return m + ":" + (s - m * 60).toFixed(2).padStart(5, "0").replace(".", ",") + " min";
  };
  const fmtL = (l) => l.toFixed(l < 10 ? 2 : 1).replace(".", ",") + " l";
  const fmtDur = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
  };
  // Minuten seit 12 Uhr mittags – damit 01:30 nach 23:00 kommt
  const nightMin = (iso) => { const d = new Date(iso); return ((d.getHours() + 12) % 24) * 60 + d.getMinutes(); };
  const nightMinToClock = (m) => { const mm = Math.round(m); const h = (Math.floor(mm / 60) + 12) % 24; return String(h).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0"); };
  const initial = (p) => (p?.emoji || (p?.name || "?").trim().charAt(0).toUpperCase());
  const avatar = (p) => `<span class="avatar" style="--pc:${esc(p?.color || "#888")}">${esc(initial(p))}</span>`;
  const activePlayers = () => S.players.filter((p) => p.active);
  const currentEvening = () => S.evenings.filter((e) => !e.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] || null;

  function toast(msg, undo) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Rückgängig</button>' : ""}`;
    t.hidden = false;
    clearTimeout(toast._t);
    if (undo) t.querySelector("button").onclick = () => { t.hidden = true; undo(); };
    toast._t = setTimeout(() => (t.hidden = true), undo ? 5000 : 2600);
  }
  function buzz(ms = 15) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }

  // ---------- Daten ----------
  const TABLES = ["players", "evenings", "drinks", "chugs", "departures", "pukes", "votes"];
  async function fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  let loading = null;
  async function loadAll() {
    if (loading) { loadAll.again = true; return loading; }
    loading = (async () => {
      try {
        const res = await Promise.all(TABLES.map(fetchAll));
        TABLES.forEach((t, i) => (S[t] = res[i]));
        S.loaded = true; S.error = null;
      } catch (e) {
        console.error(e);
        S.error = e.message || String(e);
      }
      loading = null;
      if (loadAll.again) { loadAll.again = false; return loadAll(); }
      render();
    })();
    return loading;
  }
  let reloadT;
  const scheduleReload = () => { clearTimeout(reloadT); reloadT = setTimeout(loadAll, 350); };

  async function db(op) {
    const { data, error } = await op;
    if (error) { console.error(error); toast("Hat nicht geklappt: " + (error.message || "Fehler")); throw error; }
    return data;
  }
  async function insert(table, row) {
    const data = await db(sb.from(table).insert(row).select().single());
    S[table].push(data);
    render();
    return data;
  }
  async function remove(table, id) {
    S[table] = S[table].filter((r) => r.id !== id);
    render();
    await db(sb.from(table).delete().eq("id", id));
  }
  async function patch(table, id, fields) {
    const row = byId(S[table], id);
    if (row) Object.assign(row, fields);
    render();
    await db(sb.from(table).update(fields).eq("id", id));
  }

  // ---------- Statistik ----------
  function eveningPlayers(ev) {
    const ids = new Set();
    for (const t of ["drinks", "chugs", "departures", "pukes"]) S[t].forEach((r) => r.evening_id === ev.id && ids.add(r.player_id));
    return [...ids].map(player).filter(Boolean);
  }
  function eveningStats(ev) {
    const drinks = S.drinks.filter((d) => d.evening_id === ev.id);
    const liters = drinks.reduce((s, d) => s + (DRINKS[d.kind]?.liters || 0), 0);
    const end = ev.ended_at ? new Date(ev.ended_at) : new Date();
    return {
      drinks, liters,
      pukes: S.pukes.filter((p) => p.evening_id === ev.id),
      departures: S.departures.filter((d) => d.evening_id === ev.id).sort((a, b) => a.left_at.localeCompare(b.left_at)),
      chugs: S.chugs.filter((c) => c.evening_id === ev.id),
      duration: end - new Date(ev.started_at),
      players: eveningPlayers(ev),
    };
  }
  function voteWinners(evId, cat) {
    const counts = {};
    S.votes.filter((v) => v.evening_id === evId && v.category === cat).forEach((v) => (counts[v.target_id] = (counts[v.target_id] || 0) + 1));
    const max = Math.max(0, ...Object.values(counts));
    return { counts, winners: max ? Object.keys(counts).filter((k) => counts[k] === max) : [] };
  }
  function bestChugs(kind) {
    const best = {};
    S.chugs.filter((c) => c.kind === kind).forEach((c) => { if (!best[c.player_id] || c.ms < best[c.player_id].ms) best[c.player_id] = c; });
    return Object.values(best).filter((c) => player(c.player_id)).sort((a, b) => a.ms - b.ms);
  }

  // ---------- Render ----------
  function render() {
    renderMe();
    $("#live-pill").hidden = !currentEvening();
    document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
    const v = $("#view");
    if (!S.loaded) {
      v.innerHTML = S.error
        ? `<div class="card"><h3>Keine Verbindung</h3><p class="muted">${esc(S.error)}</p><button class="btn gold block" data-act="reload">Nochmal versuchen</button></div>`
        : `<div class="loading">Lade die Stube …</div>`;
      return;
    }
    if (S.tab !== "stoppuhr") stopRaf();
    const html = { abend: viewAbend, stoppuhr: viewWatch, rangliste: viewRank, rueckblick: viewBack, crew: viewCrew }[S.tab]();
    v.innerHTML = html;
    if (S.tab === "stoppuhr") paintWatch();
  }
  function renderMe() {
    const p = player(S.me);
    const c = $("#me-chip");
    c.innerHTML = p ? `${avatar(p).replace('class="avatar"', 'class="avatar" style="width:26px;height:26px;font-size:12px;--pc:' + esc(p.color) + '"')}<span>${esc(p.name)}</span>` : "Wer bist du?";
  }

  // --- Abend ---
  function viewAbend() {
    const ev = currentEvening();
    if (!activePlayers().length) {
      return `<div class="hero"><h2>Servus, Buam!</h2><p class="muted">Legt zuerst eure Crew an. Dann kann der erste Abend starten.</p><button class="btn gold block" data-act="goto" data-tab="crew">Crew anlegen</button></div>`;
    }
    if (!ev) {
      const last = S.evenings.filter((e) => e.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
      return `
        <div class="hero">
          <div><h2>Heid geht wos?</h2><p class="muted" style="margin:6px 0 0">Starte den Abend, dann zählt die App jedes Bier, jeden Heimgang und jeden Kotzer.</p></div>
          <div class="field"><label for="ev-title">Wo seid ihr? (optional)</label><input class="input" id="ev-title" placeholder="z. B. Garage bei Max, Club, Stammtisch" maxlength="60"></div>
          <button class="btn gold block" data-act="start-evening">🍺 Abend starten</button>
        </div>
        ${last ? `<div class="section"><h3>Letzter Abend</h3>${eveningItem(last)}</div>` : ""}`;
    }
    const st = eveningStats(ev);
    const gone = new Map(st.departures.map((d) => [d.player_id, d]));
    const here = activePlayers().filter((p) => !gone.has(p.id)).length;
    const cards = activePlayers()
      .slice()
      .sort((a, b) => (gone.has(a.id) - gone.has(b.id)))
      .map((p) => playerCard(p, ev, st, gone.get(p.id)))
      .join("");
    return `
      <div class="hero">
        <div class="hero-row">
          <div style="min-width:0"><h2>${esc(ev.title || fmtDate(ev.started_at, { weekday: "long" }) + "abend")}</h2>
          <div class="muted small">seit ${fmtTime(ev.started_at)} Uhr · ${fmtDur(st.duration)}</div></div>
        </div>
        <div class="big-stats">
          <div class="stat"><b>${st.drinks.length}</b><span>Getränke</span></div>
          <div class="stat"><b>${fmtL(st.liters)}</b><span>Gesamt</span></div>
          <div class="stat"><b>${here}/${activePlayers().length}</b><span>Noch da</span></div>
        </div>
      </div>
      <div class="players">${cards}</div>
      ${voteBlock(ev)}
      <button class="btn ghost block" data-act="end-evening">Abend beenden</button>`;
  }
  function playerCard(p, ev, st, dep) {
    const mine = st.drinks.filter((d) => d.player_id === p.id);
    const liters = mine.reduce((s, d) => s + DRINKS[d.kind].liters, 0);
    const pukes = st.pukes.filter((x) => x.player_id === p.id).length;
    const btns = DRINK_KEYS.map((k) => {
      const n = mine.filter((d) => d.kind === k).length;
      return `<button class="dbtn" data-act="drink" data-p="${p.id}" data-k="${k}" aria-label="${DRINKS[k].label} für ${esc(p.name)}">
        <span class="de">${DRINKS[k].emoji}</span><span class="dl">${DRINKS[k].size}</span><span class="dc">${n ? "×" + n : "&nbsp;"}</span></button>`;
    }).join("");
    const enteredBy = dep && dep.entered_by && dep.entered_by !== p.id ? player(dep.entered_by) : null;
    return `
      <div class="pcard ${dep ? "gone" : ""}" style="--pc:${esc(p.color)}">
        <div class="phead">
          ${avatar(p)}
          <div style="min-width:0">
            <div class="pname">${esc(p.name)}</div>
            <div class="pmeta">${fmtL(liters)}${pukes ? ` · <span class="badge">🤮 ${pukes}</span>` : ""}${dep ? ` · <span class="badge home">🏠 ${fmtTime(dep.left_at)}</span>` : ""}</div>
          </div>
          <div class="pcount"><b>${mine.length}</b><span>Getränke</span></div>
        </div>
        ${dep ? `<div class="muted small">Daheim seit ${fmtTime(dep.left_at)} Uhr${enteredBy ? ` · eingetragen von ${esc(enteredBy.name)}` : ""}</div>` : `<div class="drink-btns">${btns}</div>`}
        <div class="pactions">
          ${dep ? `<button class="btn sm ghost" data-act="back" data-id="${dep.id}">Doch wieder da</button>`
                : `<button class="btn sm" data-act="home" data-p="${p.id}">🏠 Geht heim</button><button class="btn sm" data-act="puke" data-p="${p.id}">🤮 Kotzer</button>`}
        </div>
      </div>`;
  }
  function voteBlock(ev) {
    const me = player(S.me);
    const opts = activePlayers();
    const cats = VOTE_CATS.map((c) => {
      const { counts, winners } = voteWinners(ev.id, c.id);
      const my = S.votes.find((v) => v.evening_id === ev.id && v.category === c.id && v.voter_id === S.me);
      return `<div class="vote-cat">
        <div class="vote-title"><span>${c.emoji}</span><span>${c.label}</span>${winners.length ? `<span class="badge gold" style="margin-left:auto">${winners.map((w) => esc(player(w)?.name)).join(" & ")}</span>` : ""}</div>
        <div class="vote-opts">${opts.map((p) => `<button class="vopt ${my?.target_id === p.id ? "mine" : ""}" data-act="vote" data-ev="${ev.id}" data-c="${c.id}" data-p="${p.id}">${esc(p.name)}${counts[p.id] ? `<span class="vc">${counts[p.id]}</span>` : ""}</button>`).join("")}</div>
      </div>`;
    }).join("");
    return `<div class="card section">
      <div class="section-head"><h3>Abstimmung</h3><span class="muted small">${me ? "Du stimmst als " + esc(me.name) : "Erst oben „Wer bist du?“ wählen"}</span></div>
      ${cats}
    </div>`;
  }

  // --- Stoppuhr ---
  function viewWatch() {
    const w = S.watch;
    if (!player(w.player) || !player(w.player).active) w.player = S.me && player(S.me)?.active ? S.me : activePlayers()[0]?.id || null;
    if (!activePlayers().length) return `<div class="hero"><h2>Exen</h2><p class="muted">Leg zuerst die Crew an.</p><button class="btn gold block" data-act="goto" data-tab="crew">Crew anlegen</button></div>`;
    const best = bestChugs(w.kind);
    const rec = best[0];
    const pb = best.find((c) => c.player_id === w.player);
    return `
      <div class="section">
        <div class="seg" role="tablist">${CHUG_KEYS.map((k) => `<button class="${w.kind === k ? "on" : ""}" data-act="wkind" data-k="${k}">${DRINKS[k].emoji} ${DRINKS[k].label} ${DRINKS[k].size}</button>`).join("")}</div>
        <div class="chips">${activePlayers().map((p) => `<button class="chip ${w.player === p.id ? "on" : ""}" style="--pc:${esc(p.color)}" data-act="wplayer" data-p="${p.id}">${avatar(p)}${esc(p.name)}</button>`).join("")}</div>
      </div>
      <div class="card watch">
        <div class="time num" id="w-time">0,00<small> s</small></div>
        <div class="muted small" id="w-sub">${rec ? `Rekord: ${fmtMs(rec.ms)} (${esc(player(rec.player_id)?.name)})` : "Noch kein Rekord – setz den ersten!"}${pb ? ` · Deine Bestzeit: ${fmtMs(pb.ms)}` : ""}</div>
        <div id="w-controls"></div>
      </div>
      <div class="card section">
        <h3>Top 5 · ${DRINKS[w.kind].label} ${DRINKS[w.kind].size}</h3>
        ${rankList(best.slice(0, 5).map((c) => ({ p: player(c.player_id), val: fmtMs(c.ms) })))}
      </div>`;
  }
  function paintWatch() {
    const w = S.watch;
    const ctl = $("#w-controls");
    if (!ctl) return;
    if (w.result != null) {
      const best = bestChugs(w.kind)[0];
      const isRec = !best || w.result < best.ms;
      ctl.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px;align-items:center">
        ${isRec ? `<div class="record">🏆 NEUER REKORD!</div>` : ""}
        <div class="row" style="width:100%"><button class="btn ghost" data-act="wdiscard">Verwerfen</button><button class="btn gold" data-act="wsave">Speichern</button></div></div>`;
      setTime(w.result);
    } else {
      ctl.innerHTML = `<button class="go ${w.running ? "running" : ""}" data-act="wtoggle">${w.running ? "STOPP" : "START"}</button>`;
      if (w.running) tick(); else setTime(0);
    }
  }
  function setTime(ms) {
    const el = $("#w-time");
    if (!el) return;
    const s = ms / 1000;
    el.innerHTML = s < 60 ? `${s.toFixed(2).replace(".", ",")}<small> s</small>` : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0").replace(".", ",")}<small> min</small>`;
  }
  function tick() {
    const w = S.watch;
    stopRaf();
    const loop = () => { setTime(performance.now() - w.start); w.raf = requestAnimationFrame(loop); };
    loop();
  }
  function stopRaf() { if (S.watch.raf) cancelAnimationFrame(S.watch.raf); S.watch.raf = 0; }
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  // --- Rangliste ---
  function rankList(rows) {
    if (!rows.length) return `<div class="empty">Noch keine Einträge.</div>`;
    return `<div class="list">${rows.map((r, i) => `<div class="li"><span class="rank ${i === 0 ? "r1" : ""}">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>${avatar(r.p)}<div class="grow"><b>${esc(r.p?.name)}</b>${r.sub ? `<span class="muted small">${r.sub}</span>` : ""}</div><span class="val">${r.val}</span></div>`).join("")}</div>`;
  }
  function viewRank() {
    const k = S.rankKind;
    const best = bestChugs(k);
    // Getränke & Liter gesamt
    const tot = {};
    S.drinks.forEach((d) => { const t = (tot[d.player_id] ||= { n: 0, l: 0 }); t.n++; t.l += DRINKS[d.kind]?.liters || 0; });
    const drinkRows = Object.entries(tot).filter(([id]) => player(id)).sort((a, b) => b[1].l - a[1].l)
      .map(([id, t]) => ({ p: player(id), val: fmtL(t.l), sub: `${t.n} Getränke` }));
    // Kotz-Counter
    const pk = {};
    S.pukes.forEach((x) => (pk[x.player_id] = (pk[x.player_id] || 0) + 1));
    const pukeRows = Object.entries(pk).filter(([id]) => player(id)).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ p: player(id), val: `${n} × 🤮` }));
    // Heimgehen
    const dep = {};
    const lastMan = {};
    const firstOut = {};
    S.evenings.filter((e) => e.ended_at).forEach((ev) => {
      const st = eveningStats(ev);
      if (st.players.length < 2) return;
      const leftAt = new Map(st.departures.map((d) => [d.player_id, nightMin(d.left_at)]));
      const stayEnd = nightMin(ev.ended_at);
      const times = st.players.map((p) => ({ id: p.id, t: leftAt.has(p.id) ? leftAt.get(p.id) : stayEnd }));
      times.forEach((x) => { const d = (dep[x.id] ||= { sum: 0, n: 0 }); d.sum += x.t; d.n++; });
      const max = Math.max(...times.map((x) => x.t));
      const min = Math.min(...times.map((x) => x.t));
      if (max !== min) {
        times.filter((x) => x.t === max).forEach((x) => (lastMan[x.id] = (lastMan[x.id] || 0) + 1));
        times.filter((x) => x.t === min).forEach((x) => (firstOut[x.id] = (firstOut[x.id] || 0) + 1));
      }
    });
    const depRows = Object.entries(dep).filter(([id]) => player(id)).sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)
      .map(([id, d]) => ({ p: player(id), val: "Ø " + nightMinToClock(d.sum / d.n), sub: `${firstOut[id] || 0}× als Erster heim · ${lastMan[id] || 0}× Letzter Mann` }));
    // Titel aus Abstimmungen
    const titles = {};
    S.evenings.forEach((ev) => VOTE_CATS.forEach((c) => voteWinners(ev.id, c.id).winners.forEach((w) => { (titles[w] ||= {})[c.id] = (titles[w][c.id] || 0) + 1; })));
    const titleBlock = VOTE_CATS.map((c) => {
      const rows = Object.entries(titles).filter(([id, t]) => player(id) && t[c.id]).sort((a, b) => b[1][c.id] - a[1][c.id]).map(([id, t]) => ({ p: player(id), val: `${t[c.id]}×` }));
      return `<div class="card section"><h3>${c.emoji} ${c.label} – Titel</h3>${rankList(rows)}</div>`;
    }).join("");

    return `
      <h2>Rangliste</h2>
      <div class="card section">
        <h3>⏱️ Schnellstes Exen</h3>
        <div class="seg">${CHUG_KEYS.map((x) => `<button class="${k === x ? "on" : ""}" data-act="rkind" data-k="${x}">${DRINKS[x].label} ${DRINKS[x].size}</button>`).join("")}</div>
        ${rankList(best.map((c) => ({ p: player(c.player_id), val: fmtMs(c.ms), sub: fmtDate(c.created_at) })))}
      </div>
      <div class="card section"><h3>🍺 Ewige Trinker-Tabelle</h3>${rankList(drinkRows)}</div>
      <div class="card section"><h3>🤮 Kotz-Counter</h3>${rankList(pukeRows)}</div>
      <div class="card section"><h3>🏠 Wer geht am frühesten?</h3>${rankList(depRows)}<div class="muted small">Zählt nur beendete Abende. Wer nicht heimgegangen ist, gilt bis Abend-Ende als da.</div></div>
      ${titleBlock}`;
  }

  // --- Rückblick ---
  function eveningItem(ev) {
    const st = eveningStats(ev);
    const d = new Date(ev.started_at);
    const mvp = voteWinners(ev.id, "mvp").winners.map((w) => player(w)?.name).filter(Boolean);
    return `<button class="evening-item" data-act="open-evening" data-id="${ev.id}">
      <div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "")}</span></div>
      <div style="min-width:0;flex:1"><b style="display:block">${esc(ev.title || fmtDate(ev.started_at, { weekday: "long" }) + "abend")}</b>
      <span class="muted small">${st.drinks.length} Getränke · ${fmtL(st.liters)}${st.pukes.length ? ` · 🤮 ${st.pukes.length}` : ""}${mvp.length ? ` · 👑 ${esc(mvp.join(" & "))}` : ""}</span></div>
      <span class="muted">›</span></button>`;
  }
  function viewBack() {
    const evs = S.evenings.slice().sort((a, b) => b.started_at.localeCompare(a.started_at));
    const totL = S.drinks.reduce((s, d) => s + (DRINKS[d.kind]?.liters || 0), 0);
    const beers = S.drinks.filter((d) => d.kind === "helles" || d.kind === "halbe").length;
    const year = new Date().getFullYear();
    const yearEvs = evs.filter((e) => new Date(e.started_at).getFullYear() === year);
    return `
      <h2>Rückblick</h2>
      <div class="hero">
        <h3>Gesamtbilanz</h3>
        <div class="big-stats">
          <div class="stat"><b>${evs.length}</b><span>Abende</span></div>
          <div class="stat"><b>${fmtL(totL)}</b><span>Getrunken</span></div>
          <div class="stat"><b>${beers}</b><span>Bier</span></div>
        </div>
        <div class="muted small">${yearEvs.length} Abende in ${year} · ${S.pukes.length}× gekotzt · ${S.chugs.length}× geext</div>
      </div>
      <div class="section">${evs.length ? evs.map(eveningItem).join("") : `<div class="empty">Noch kein Abend. Starte im Tab „Abend“ den ersten.</div>`}</div>`;
  }
  function openEvening(id) {
    const ev = byId(S.evenings, id);
    if (!ev) return;
    const st = eveningStats(ev);
    const per = st.players.map((p) => {
      const ds = st.drinks.filter((d) => d.player_id === p.id);
      return { p, n: ds.length, l: ds.reduce((s, d) => s + DRINKS[d.kind].liters, 0) };
    }).sort((a, b) => b.l - a.l);
    const maxL = Math.max(0.01, ...per.map((x) => x.l));
    const timeline = [
      { t: ev.started_at, txt: "Abend gestartet" },
      ...st.departures.map((d) => ({ t: d.left_at, txt: `🏠 ${esc(player(d.player_id)?.name)} geht heim` })),
      ...st.pukes.map((x) => ({ t: x.created_at, txt: `🤮 ${esc(player(x.player_id)?.name)} kotzt` })),
      ...st.chugs.map((c) => ({ t: c.created_at, txt: `⏱️ ${esc(player(c.player_id)?.name)} ext ${DRINKS[c.kind]?.label} in ${fmtMs(c.ms)}` })),
      ...(ev.ended_at ? [{ t: ev.ended_at, txt: "Abend beendet" }] : []),
    ].sort((a, b) => a.t.localeCompare(b.t));
    openSheet(`
      <div><h2>${esc(ev.title || fmtDate(ev.started_at, { weekday: "long" }) + "abend")}</h2>
      <div class="muted small">${fmtDate(ev.started_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${fmtTime(ev.started_at)}–${ev.ended_at ? fmtTime(ev.ended_at) : "läuft"} · ${fmtDur(st.duration)}</div></div>
      <div class="big-stats">
        <div class="stat"><b>${st.drinks.length}</b><span>Getränke</span></div>
        <div class="stat"><b>${fmtL(st.liters)}</b><span>Liter</span></div>
        <div class="stat"><b>${st.pukes.length}</b><span>Kotzer</span></div>
      </div>
      <div class="section"><h3>Wer hat wie viel</h3>
        <div class="list">${per.map((x) => `<div class="li">${avatar(x.p)}<div class="grow"><b>${esc(x.p.name)}</b><div class="bar" style="--pc:${esc(x.p.color)}"><i style="width:${(x.l / maxL) * 100}%"></i></div></div><span class="val">${fmtL(x.l)}<br><span class="muted small">${x.n}×</span></span></div>`).join("") || `<div class="empty">Nichts eingetragen.</div>`}</div>
      </div>
      ${voteBlock(ev)}
      <div class="section"><h3>Verlauf</h3><div class="timeline">${timeline.map((x) => `<div class="tl"><span class="num">${fmtTime(x.t)}</span><span>${x.txt}</span></div>`).join("")}</div></div>
      <div class="row">
        <button class="btn ghost" data-act="close">Schließen</button>
        <button class="btn ghost" data-act="del-evening" data-id="${ev.id}" style="color:var(--red)">Abend löschen</button>
      </div>`);
    S.openEvening = id;
  }

  // --- Crew ---
  function viewCrew() {
    const ps = S.players.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    return `
      <h2>Crew</h2>
      <div class="card section">
        <h3>Neuer Bua</h3>
        <div class="field"><label for="np-name">Name</label><input class="input" id="np-name" maxlength="20" placeholder="Name oder Spitzname"></div>
        <div class="field"><label>Farbe</label><div class="swatches" id="np-colors">${COLORS.map((c, i) => `<button class="sw ${i === S.players.length % COLORS.length ? "on" : ""}" data-act="pick-color" data-c="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join("")}</div></div>
        <button class="btn gold block" data-act="add-player">Hinzufügen</button>
      </div>
      <div class="card section">
        <h3>Alle (${S.players.length})</h3>
        <div class="list">${ps.map((p) => `<div class="li" style="${p.active ? "" : "opacity:.5"}">${avatar(p)}<div class="grow"><b>${esc(p.name)}${p.id === S.me ? ' <span class="badge gold">Du</span>' : ""}</b><span class="muted small">${p.active ? "aktiv" : "ausgeblendet"}</span></div><button class="btn sm ghost" data-act="edit-player" data-p="${p.id}">Bearbeiten</button></div>`).join("") || `<div class="empty">Noch niemand.</div>`}</div>
      </div>
      <div class="card section">
        <h3>📲 Als App installieren</h3>
        <div class="small"><b>iPhone:</b> In Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.<br><b>Android:</b> In Chrome öffnen → Menü ⋮ → „App installieren“.</div>
        <button class="btn block" data-act="share">🔗 Link kopieren</button>
      </div>`;
  }
  function editPlayer(id) {
    const p = player(id);
    if (!p) return;
    openSheet(`
      <h2>${esc(p.name)} bearbeiten</h2>
      <div class="field"><label for="ep-name">Name</label><input class="input" id="ep-name" maxlength="20" value="${esc(p.name)}"></div>
      <div class="field"><label for="ep-emoji">Emoji statt Buchstabe (optional)</label><input class="input" id="ep-emoji" maxlength="4" value="${esc(p.emoji || "")}" placeholder="z. B. 🐻"></div>
      <div class="field"><label>Farbe</label><div class="swatches" id="ep-colors">${COLORS.map((c) => `<button class="sw ${c === p.color ? "on" : ""}" data-act="pick-color" data-c="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join("")}</div></div>
      <button class="btn gold block" data-act="save-player" data-p="${p.id}">Speichern</button>
      <button class="btn block" data-act="toggle-player" data-p="${p.id}">${p.active ? "Ausblenden (Statistik bleibt)" : "Wieder aktivieren"}</button>
      <button class="btn ghost block" data-act="close">Abbrechen</button>`);
  }
  function pickMe() {
    const ps = activePlayers();
    openSheet(`
      <h2>Wer bist du?</h2>
      <p class="muted" style="margin:0">Wird nur auf diesem Handy gespeichert, damit du abstimmen kannst und man sieht, wer was eingetragen hat.</p>
      <div class="chips">${ps.map((p) => `<button class="chip ${p.id === S.me ? "on" : ""}" style="--pc:${esc(p.color)}" data-act="set-me" data-p="${p.id}">${avatar(p)}${esc(p.name)}</button>`).join("") || `<span class="empty">Erst Crew anlegen.</span>`}</div>
      ${ps.length ? "" : `<button class="btn gold block" data-act="goto" data-tab="crew">Crew anlegen</button>`}`);
  }
  function confirmSheet(title, text, label, cls, onYes) {
    openSheet(`<h2>${title}</h2>${text ? `<p class="muted" style="margin:0">${text}</p>` : ""}<div class="row"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn ${cls}" data-act="confirm-yes">${label}</button></div>`);
    confirmSheet.cb = onYes;
  }
  function openSheet(html) { $("#sheet-body").innerHTML = html; $("#sheet").hidden = false; }
  function closeSheet() { $("#sheet").hidden = true; S.openEvening = null; }

  // ---------- Aktionen ----------
  const actions = {
    reload: () => loadAll(),
    goto: (el) => { closeSheet(); S.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    close: closeSheet,
    "start-evening": async () => {
      const title = ($("#ev-title")?.value || "").trim() || null;
      await insert("evenings", { title });
      buzz(30); toast("Abend gestartet. Prost! 🍻");
    },
    "end-evening": () => confirmSheet("Abend beenden?", "Danach landet er im Rückblick. Abstimmen geht dort weiter.", "Beenden", "gold", async () => {
      const ev = currentEvening();
      if (ev) await patch("evenings", ev.id, { ended_at: new Date().toISOString() });
      closeSheet(); S.tab = "rueckblick"; render(); if (ev) openEvening(ev.id);
    }),
    drink: async (el) => {
      const ev = currentEvening();
      const p = player(el.dataset.p), k = el.dataset.k;
      buzz();
      const row = await insert("drinks", { evening_id: ev?.id || null, player_id: p.id, kind: k });
      toast(`${DRINKS[k].emoji} ${DRINKS[k].label} für ${p.name}`, () => remove("drinks", row.id));
    },
    home: (el) => {
      const p = player(el.dataset.p);
      const self = el.dataset.p === S.me;
      confirmSheet(`🏠 ${esc(p.name)} geht heim?`, self ? "Gute Heimreise!" : "Du trägst das für " + esc(p.name) + " ein.", "Eintragen", "gold", async () => {
        closeSheet();
        const ev = currentEvening();
        const row = await insert("departures", { evening_id: ev.id, player_id: p.id, entered_by: S.me || null });
        toast(`${p.name} ist daheim (${fmtTime(row.left_at)})`, () => remove("departures", row.id));
      });
    },
    back: (el) => remove("departures", el.dataset.id),
    puke: (el) => {
      const p = player(el.dataset.p);
      confirmSheet(`🤮 ${esc(p.name)} hat gekotzt?`, "Kommt in den ewigen Kotz-Counter.", "Eintragen", "red", async () => {
        closeSheet();
        const row = await insert("pukes", { evening_id: currentEvening()?.id || null, player_id: p.id });
        buzz(60);
        toast(`Kotzer für ${p.name} notiert`, () => remove("pukes", row.id));
      });
    },
    vote: async (el) => {
      if (!S.me) return pickMe();
      const { ev, c, p } = el.dataset;
      const existing = S.votes.find((v) => v.evening_id === ev && v.category === c && v.voter_id === S.me);
      buzz();
      if (existing && existing.target_id === p) { const done = remove("votes", existing.id); if (S.openEvening) openEvening(S.openEvening); return done; }
      if (existing) { existing.target_id = p; render(); if (S.openEvening) openEvening(S.openEvening); await db(sb.from("votes").update({ target_id: p }).eq("id", existing.id)); return; }
      await insert("votes", { evening_id: ev, category: c, voter_id: S.me, target_id: p });
      if (S.openEvening) openEvening(S.openEvening);
    },
    wkind: (el) => { if (S.watch.running) return; S.watch.kind = el.dataset.k; store.set("bbb_watch_kind", el.dataset.k); S.watch.result = null; render(); },
    wplayer: (el) => { if (S.watch.running) return; S.watch.player = el.dataset.p; store.set("bbb_watch_player", el.dataset.p); S.watch.result = null; render(); },
    wtoggle: () => {
      const w = S.watch;
      if (!w.running) { w.running = true; w.start = performance.now(); buzz(40); keepAwake(true); paintWatch(); }
      else { w.running = false; w.result = Math.round(performance.now() - w.start); stopRaf(); buzz(80); keepAwake(false); paintWatch(); }
    },
    wdiscard: () => { S.watch.result = null; render(); },
    wsave: async () => {
      const w = S.watch;
      const ms = w.result;
      const prev = bestChugs(w.kind)[0];
      w.result = null;
      await insert("chugs", { evening_id: currentEvening()?.id || null, player_id: w.player, kind: w.kind, ms });
      toast(!prev || ms < prev.ms ? "🏆 Neuer Rekord gespeichert!" : `Gespeichert: ${fmtMs(ms)}`);
    },
    rkind: (el) => { S.rankKind = el.dataset.k; render(); },
    "open-evening": (el) => openEvening(el.dataset.id),
    "del-evening": (el) => {
      const id = el.dataset.id;
      confirmSheet("Abend löschen?", "Alle Getränke, Heimgänge, Kotzer und Stimmen dieses Abends werden gelöscht. Exen-Zeiten bleiben.", "Endgültig löschen", "red", async () => {
        closeSheet();
        await remove("evenings", id);
        ["drinks", "departures", "pukes", "votes"].forEach((t) => (S[t] = S[t].filter((r) => r.evening_id !== id)));
        render(); toast("Abend gelöscht");
      });
    },
    "pick-color": (el) => { el.parentElement.querySelectorAll(".sw").forEach((s) => s.classList.toggle("on", s === el)); },
    "add-player": async () => {
      const name = ($("#np-name").value || "").trim();
      if (!name) { $("#np-name").focus(); return toast("Gib einen Namen ein"); }
      const color = $("#np-colors .sw.on")?.dataset.c || COLORS[0];
      const p = await insert("players", { name, color });
      if (!S.me) { S.me = p.id; store.set("bbb_me", p.id); }
      toast(`${name} ist dabei 🤠`);
    },
    "edit-player": (el) => editPlayer(el.dataset.p),
    "save-player": async (el) => {
      const name = ($("#ep-name").value || "").trim();
      if (!name) return toast("Name darf nicht leer sein");
      const emoji = ($("#ep-emoji").value || "").trim() || null;
      const color = $("#ep-colors .sw.on")?.dataset.c;
      closeSheet();
      await patch("players", el.dataset.p, { name, emoji, color });
      toast("Gespeichert");
    },
    "toggle-player": async (el) => { const p = player(el.dataset.p); closeSheet(); await patch("players", p.id, { active: !p.active }); },
    "set-me": (el) => { S.me = el.dataset.p; store.set("bbb_me", S.me); closeSheet(); render(); toast(`Servus, ${player(S.me).name}!`); },
    share: async () => {
      const url = location.origin + location.pathname;
      try { await navigator.clipboard.writeText(url); toast("Link kopiert – ab in die Gruppe damit!"); }
      catch { toast(url); }
    },
    "confirm-yes": () => confirmSheet.cb && confirmSheet.cb(),
  };

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const tab = e.target.closest("#tabbar button");
    if (tab) { if (S.watch.running) return toast("Erst die Stoppuhr stoppen"); S.tab = tab.dataset.tab; store.set("bbb_tab", S.tab); render(); window.scrollTo(0, 0); return; }
    if (e.target.closest("#me-chip")) return pickMe();
    const el = e.target.closest("[data-act]");
    if (!el || !actions[el.dataset.act]) return;
    if (el.disabled) return;
    el.disabled = el.tagName === "BUTTON" && ["drink", "wsave", "add-player", "start-evening", "confirm-yes"].includes(el.dataset.act);
    try { await actions[el.dataset.act](el); } catch (err) { console.error(err); }
    finally { el.disabled = false; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
    if (e.key === "Enter" && e.target.id === "np-name") actions["add-player"]();
  });

  // ---------- Start ----------
  S.tab = store.get("bbb_tab") || "abend";
  render();
  loadAll();
  sb.channel("stube")
    .on("postgres_changes", { event: "*", schema: "public" }, scheduleReload)
    .subscribe();
  setInterval(() => { if (document.visibilityState === "visible" && !S.watch.running) loadAll(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadAll(); });
  setInterval(() => { if (S.tab === "abend" && currentEvening() && $("#sheet").hidden && !document.activeElement?.matches("input")) render(); }, 60000);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();

/* Bergbauerbuam – die App für unsere Abende */
(() => {
  "use strict";

  // ---------- Konfiguration ----------
  const DRINKS = {
    helles:    { label: "Helles",    size: "0,33", liters: 0.33, emoji: "🍺", chug: true },
    halbe:     { label: "Halbe",     size: "0,5",  liters: 0.5,  emoji: "🍻", chug: true },
    longdrink: { label: "Longdrink", size: "0,3",  liters: 0.3,  emoji: "🍹", chug: true },
    shot:      { label: "Shot",      size: "2 cl", liters: 0.02, emoji: "🥃", chug: false },
    wasser:    { label: "Wasser",    size: "💧",   liters: 0.5,  emoji: "💧", chug: false, water: true },
  };
  const isAlc = (d) => !DRINKS[d.kind]?.water;
  const alcL = (d) => (isAlc(d) ? DRINKS[d.kind]?.liters || 0 : 0);
  const DRINK_KEYS = Object.keys(DRINKS);
  const CHUG_KEYS = DRINK_KEYS.filter((k) => DRINKS[k].chug);
  const VOTE_CATS = [
    { id: "vollster", label: "Der Vollste", emoji: "🥴" },
    { id: "mvp", label: "MVP", emoji: "👑" },
    { id: "lvp", label: "LVP", emoji: "🪦" },
  ];
  const COLORS = ["#f2b632", "#6aa6ec", "#ef5b5b", "#5fcf8a", "#c58cf2", "#f28f4b", "#4fd1c5", "#f06fb0"];
  const PLAYER_COLS = "id,name,color,emoji,active,created_at,avatar,is_admin,claimed";
  const FRESH_MS = 10 * 60 * 1000;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  const cfg = window.BBB_CONFIG || {};
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

  // ---------- Zustand ----------
  const S = {
    tab: store.get("bbb_tab") || "abend",
    players: [], evenings: [], drinks: [], chugs: [], departures: [], pukes: [], votes: [], media: [], messages: [],
    abendView: "zaehlen", month: null, kastenPreis: store.get("bbb_kasten") || "",
    loaded: false, error: null,
    me: store.get("bbb_me"), pin: store.get("bbb_pin"), authed: false, authChecked: false,
    watch: { player: store.get("bbb_watch_player"), kind: store.get("bbb_watch_kind") || "halbe", running: false, start: 0, result: null, raf: 0 },
    rankKind: "halbe", statsView: "ranglisten",
    game: null, g: {},
    openEvening: null,
  };

  // ---------- Helfer ----------
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const player = (id) => byId(S.players, id);
  const me = () => (S.authed ? player(S.me) : null);
  const isAdmin = () => !!me()?.is_admin;
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso, o) => new Date(iso).toLocaleDateString("de-DE", o || { weekday: "short", day: "numeric", month: "short" });
  const fmtMs = (ms) => {
    const s = ms / 1000;
    if (s < 60) return s.toFixed(2).replace(".", ",") + " s";
    const m = Math.floor(s / 60);
    return m + ":" + (s - m * 60).toFixed(2).padStart(5, "0").replace(".", ",") + " min";
  };
  const fmtL = (l) => l.toFixed(l < 10 ? 2 : 1).replace(".", ",") + " l";
  const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min"; };
  const nightMin = (iso) => { const d = new Date(iso); return ((d.getHours() + 12) % 24) * 60 + d.getMinutes(); };
  const nightMinToClock = (m) => { const mm = Math.round(m); const h = (Math.floor(mm / 60) + 12) % 24; return String(h).padStart(2, "0") + ":" + String(mm % 60).padStart(2, "0"); };
  const initial = (p) => p?.emoji || (p?.name || "?").trim().charAt(0).toUpperCase();
  const avatar = (p, size) => {
    const st = `--pc:${esc(p?.color || "#888")}${size ? `;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px` : ""}`;
    return p?.avatar
      ? `<span class="avatar img" style="${st}"><img src="${esc(p.avatar)}" alt=""></span>`
      : `<span class="avatar" style="${st}">${esc(initial(p))}</span>`;
  };
  const activePlayers = () => S.players.filter((p) => p.active);
  const currentEvening = () => S.evenings.filter((e) => !e.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] || null;
  const evName = (ev) => ev.title || fmtDate(ev.started_at, { weekday: "long" }) + "abend";
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function toast(msg, undo) {
    const t = $("#toast");
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Rückgängig</button>' : ""}`;
    t.hidden = false;
    clearTimeout(toast._t);
    if (undo) t.querySelector("button").onclick = () => { t.hidden = true; undo(); };
    toast._t = setTimeout(() => (t.hidden = true), undo ? 5000 : 2600);
  }
  function buzz(ms = 15) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
  function errMsg(e) { return (e && (e.message || e.details)) || "Unbekannter Fehler"; }

  // ---------- Daten ----------
  const TABLES = ["players", "evenings", "drinks", "chugs", "departures", "pukes", "votes", "media", "messages"];
  async function fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select(table === "players" ? PLAYER_COLS : "*").order("created_at", { ascending: true }).range(from, from + 999);
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
        if (!S.authChecked) await checkAuth();
      } catch (e) {
        console.error(e);
        S.error = errMsg(e);
      }
      loading = null;
      if (loadAll.again) { loadAll.again = false; return loadAll(); }
      render();
    })();
    return loading;
  }
  let reloadT;
  const scheduleReload = () => { clearTimeout(reloadT); reloadT = setTimeout(loadAll, 350); };

  async function checkAuth() {
    S.authChecked = true;
    if (!S.me || !S.pin || !player(S.me)) { S.authed = false; return; }
    const { data, error } = await sb.rpc("bbb_check", { p_player: S.me, p_pin: S.pin });
    S.authed = !error && data === true;
    if (!S.authed) logout(true);
  }
  function logout(silent) {
    S.authed = false; S.pin = null;
    store.set("bbb_pin", null);
    if (!silent) { S.me = null; store.set("bbb_me", null); }
  }

  async function db(op) {
    const { data, error } = await op;
    if (error) { console.error(error); toast(errMsg(error)); throw error; }
    return data;
  }
  async function rpc(fn, args) {
    return db(sb.rpc(fn, Object.assign({ p_player: S.me, p_pin: S.pin }, args || {})));
  }
  async function insert(table, row) {
    const data = await db(sb.from(table).insert(row).select().single());
    S[table].push(data);
    render();
    return data;
  }
  async function remove(table, id) {
    const before = S[table];
    S[table] = S[table].filter((r) => r.id !== id);
    render();
    try { await rpc("bbb_delete", { p_table: table, p_id: id }); }
    catch (e) { S[table] = before; render(); throw e; }
  }
  async function patch(table, id, fields) {
    const row = byId(S[table], id);
    if (row) Object.assign(row, fields);
    render();
    await db(sb.from(table).update(fields).eq("id", id));
  }
  function canDelete(table, row) {
    if (!row || !S.authed) return false;
    if (isAdmin()) return true;
    if (table === "evenings") return false;
    if (table === "departures") return true;
    if (table === "votes") return row.voter_id === S.me;
    if (table === "media" || table === "messages") return row.player_id === S.me;
    return Date.now() - new Date(row.created_at).getTime() < FRESH_MS;
  }

  // ---------- Statistik ----------
  function eveningPlayers(ev) {
    const ids = new Set();
    for (const t of ["drinks", "chugs", "departures", "pukes"]) S[t].forEach((r) => r.evening_id === ev.id && ids.add(r.player_id));
    return [...ids].map(player).filter(Boolean);
  }
  function eveningStats(ev) {
    const all = S.drinks.filter((d) => d.evening_id === ev.id);
    const drinks = all.filter(isAlc);
    const liters = drinks.reduce((s, d) => s + alcL(d), 0);
    const end = ev.ended_at ? new Date(ev.ended_at) : new Date();
    return {
      all, drinks, liters, waters: all.filter((d) => !isAlc(d)),
      media: S.media.filter((m) => m.evening_id === ev.id),
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
  function departureStats(evs = S.evenings) {
    const dep = {}, lastMan = {}, firstOut = {};
    evs.filter((e) => e.ended_at).forEach((ev) => {
      const st = eveningStats(ev);
      if (st.players.length < 2) return;
      const leftAt = new Map(st.departures.map((d) => [d.player_id, nightMin(d.left_at)]));
      const stayEnd = nightMin(ev.ended_at);
      const times = st.players.map((p) => ({ id: p.id, t: leftAt.has(p.id) ? leftAt.get(p.id) : stayEnd }));
      times.forEach((x) => { const d = (dep[x.id] ||= { sum: 0, n: 0 }); d.sum += x.t; d.n++; });
      const max = Math.max(...times.map((x) => x.t)), min = Math.min(...times.map((x) => x.t));
      if (max !== min) {
        times.filter((x) => x.t === max).forEach((x) => (lastMan[x.id] = (lastMan[x.id] || 0) + 1));
        times.filter((x) => x.t === min).forEach((x) => (firstOut[x.id] = (firstOut[x.id] || 0) + 1));
      }
    });
    return { dep, lastMan, firstOut };
  }
  function playerTotals(id) {
    const dsAll = S.drinks.filter((d) => d.player_id === id);
    const ds = dsAll.filter(isAlc);
    const titles = {};
    S.evenings.forEach((ev) => VOTE_CATS.forEach((c) => { if (voteWinners(ev.id, c.id).winners.includes(id)) titles[c.id] = (titles[c.id] || 0) + 1; }));
    const best = {};
    CHUG_KEYS.forEach((k) => { const b = bestChugs(k).find((c) => c.player_id === id); if (b) best[k] = b.ms; });
    const evs = new Set(); ["drinks", "chugs", "departures", "pukes"].forEach((t) => S[t].forEach((r) => r.player_id === id && r.evening_id && evs.add(r.evening_id)));
    return { n: ds.length, water: dsAll.length - ds.length, halbe: ds.filter((d) => d.kind === "halbe").length, uploads: S.media.filter((m) => m.player_id === id).length, l: ds.reduce((s, d) => s + alcL(d), 0), pukes: S.pukes.filter((x) => x.player_id === id).length, titles, best, evenings: evs.size };
  }

  // ---------- Render ----------
  function render() {
    renderHeader();
    const tabbar = $("#tabbar");
    const v = $("#view");
    if (!S.loaded) {
      tabbar.hidden = true;
      v.innerHTML = S.error
        ? `<div class="card section"><h3>Keine Verbindung</h3><p class="muted" style="margin:0">${esc(S.error)}</p><button class="btn gold block" data-act="reload">Nochmal versuchen</button></div>`
        : `<div class="loading">Lade die Stube …</div>`;
      return;
    }
    if (!S.authed) { tabbar.hidden = true; v.innerHTML = viewLogin(); return; }
    tabbar.hidden = false;
    document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab));
    if (S.tab !== "exen") stopRaf();
    const views = { abend: viewAbend, exen: viewWatch, spiele: viewGames, stats: viewStats, profil: viewProfile };
    const keep = {};
    v.querySelectorAll("input[id], textarea[id]").forEach((i) => { if (i.type !== "file") keep[i.id] = { v: i.value, f: document.activeElement === i, s: i.selectionStart }; });
    const chatEl = v.querySelector(".chat-list");
    const nearBottom = !chatEl || window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    v.innerHTML = (views[S.tab] || viewAbend)();
    Object.entries(keep).forEach(([id, k]) => { const i = document.getElementById(id); if (i) { i.value = k.v; if (k.f) { i.focus(); try { i.setSelectionRange(k.s, k.s); } catch {} } } });
    if (v.querySelector(".chat-list") && (nearBottom || S.scrollChat)) { S.scrollChat = false; requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }
    const game = S.tab === "spiele" && S.game && allGames().find((x) => x.id === S.game);
    if (game?.after) game.after();
    if (S.tab === "exen") paintWatch();
    if (S.tab === "spiele" && S.game === "rad") drawWheel();
    if (S.openEvening && !$("#sheet").hidden) openEvening(S.openEvening, true);
  }
  function renderHeader() {
    $("#live-pill").hidden = !(S.authed && currentEvening());
    const c = $("#me-chip");
    const p = me();
    c.hidden = !p;
    if (p) c.innerHTML = `${avatar(p, 26)}<span>${esc(p.name)}</span>${p.is_admin ? '<span class="crown" title="Admin">★</span>' : ""}`;
  }

  // --- Anmelden ---
  function viewLogin() {
    const ps = activePlayers();
    return `
      <div class="login">
        <img class="login-icon" src="icons/icon-192.png" alt="">
        <h2>Servus! Wer bist du?</h2>
        <p class="muted" style="margin:0">Tipp auf deinen Namen. Beim ersten Mal wählst du eine 4-stellige PIN, damit nur du dein Profil benutzen kannst.</p>
        <div class="login-grid">
          ${ps.map((p) => `<button class="login-p" data-act="login-pick" data-p="${p.id}">${avatar(p, 64)}<b>${esc(p.name)}</b><span class="muted small">${p.claimed ? "PIN eingeben" : "Noch frei"}</span></button>`).join("") || `<div class="empty">Noch keine Spieler angelegt.</div>`}
        </div>
      </div>`;
  }
  function loginSheet(id) {
    const p = player(id);
    openSheet(`
      <div class="sheet-head">${avatar(p, 56)}<div><h2>${esc(p.name)}</h2><div class="muted small">${p.claimed ? "Gib deine PIN ein" : "Wähle eine 4-stellige PIN für dein Profil"}</div></div></div>
      <div class="field"><label for="pin">${p.claimed ? "PIN" : "Neue PIN"}</label><input class="input pin" id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" placeholder="••••"></div>
      ${p.claimed ? "" : `<p class="muted small" style="margin:0">Merk sie dir gut. Falls du sie vergisst, kann Georg sie zurücksetzen.</p>`}
      <button class="btn gold block" data-act="login-go" data-p="${p.id}">${p.claimed ? "Anmelden" : "Das bin ich"}</button>
      <button class="btn ghost block" data-act="close">Abbrechen</button>`);
    setTimeout(() => $("#pin")?.focus(), 80);
  }

  // --- Abend ---
  function viewAbend() {
    const ev = currentEvening();
    const evId = ev?.id || null;
    const nMsg = S.messages.filter((m) => (m.evening_id || null) === evId).length;
    const nMedia = ev ? S.media.filter((m) => m.evening_id === evId).length : S.media.length;
    const seg = `<div class="seg big">
      <button class="${S.abendView === "zaehlen" ? "on" : ""}" data-act="abend-view" data-v="zaehlen">🍺 Zählen</button>
      <button class="${S.abendView === "chat" ? "on" : ""}" data-act="abend-view" data-v="chat">💬 Chat${nMsg ? ` <span class="seg-n">${nMsg}</span>` : ""}</button>
      <button class="${S.abendView === "album" ? "on" : ""}" data-act="abend-view" data-v="album">📸 Album${nMedia ? ` <span class="seg-n">${nMedia}</span>` : ""}</button>
    </div>`;
    if (S.abendView === "chat") return seg + viewChat(ev);
    if (S.abendView === "album") return seg + viewAlbum(ev);
    return seg + viewCount();
  }
  function viewCount() {
    const ev = currentEvening();
    if (!ev) {
      const last = S.evenings.filter((e) => e.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
      return `
        <div class="hero">
          <div><h2>Heid geht wos?</h2><p class="muted" style="margin:6px 0 0">Starte den Abend, dann zählt die App jedes Bier, jeden Heimgang und jeden Kotzer.</p></div>
          <div class="field"><label for="ev-title">Wo seid ihr? (optional)</label><input class="input" id="ev-title" placeholder="z. B. Garage, Club, Stammtisch" maxlength="60"></div>
          <button class="btn gold block" data-act="start-evening">🍺 Abend starten</button>
        </div>
        ${last ? `<div class="section"><h3>Letzter Abend</h3>${eveningItem(last)}</div>` : ""}`;
    }
    const st = eveningStats(ev);
    const gone = new Map(st.departures.map((d) => [d.player_id, d]));
    const here = activePlayers().filter((p) => !gone.has(p.id)).length;
    const ordered = activePlayers().slice().sort((a, b) => (gone.has(a.id) - gone.has(b.id)) || (b.id === S.me) - (a.id === S.me));
    return `
      <div class="hero">
        <div class="hero-row">
          <div style="min-width:0"><h2>${esc(evName(ev))}</h2><div class="muted small">seit ${fmtTime(ev.started_at)} Uhr · ${fmtDur(st.duration)}</div></div>
          <button class="btn sm ghost" data-act="open-evening" data-id="${ev.id}">Verlauf</button>
        </div>
        <div class="big-stats">
          <div class="stat"><b>${st.drinks.length}</b><span>Getränke</span></div>
          <div class="stat"><b>${fmtL(st.liters)}</b><span>Gesamt</span></div>
          <div class="stat"><b>${here}/${activePlayers().length}</b><span>Noch da</span></div>
        </div>
      </div>
      <div class="players">${ordered.map((p) => playerCard(p, st, gone.get(p.id))).join("")}</div>
      ${voteBlock(ev)}
      <button class="btn ghost block" data-act="end-evening">Abend beenden</button>`;
  }
  function playerCard(p, st, dep) {
    const mineAll = st.all.filter((d) => d.player_id === p.id);
    const mine = mineAll.filter(isAlc);
    const liters = mine.reduce((s, d) => s + alcL(d), 0);
    const pukes = st.pukes.filter((x) => x.player_id === p.id).length;
    const btns = DRINK_KEYS.map((k) => {
      const n = mineAll.filter((d) => d.kind === k).length;
      return `<button class="dbtn ${DRINKS[k].water ? "water" : ""}" data-act="drink" data-p="${p.id}" data-k="${k}" aria-label="${DRINKS[k].label} für ${esc(p.name)}">
        <span class="de">${DRINKS[k].emoji}</span><span class="dl">${DRINKS[k].water ? "Wasser" : DRINKS[k].size}</span><span class="dc">${n ? "×" + n : "&nbsp;"}</span></button>`;
    }).join("");
    const enteredBy = dep && dep.entered_by && dep.entered_by !== p.id ? player(dep.entered_by) : null;
    return `
      <div class="pcard ${dep ? "gone" : ""}" style="--pc:${esc(p.color)}">
        <div class="phead">
          ${avatar(p)}
          <div style="min-width:0">
            <div class="pname">${esc(p.name)}${p.id === S.me ? ' <span class="badge gold">Du</span>' : ""}</div>
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
    const opts = activePlayers();
    const cats = VOTE_CATS.map((c) => {
      const { counts, winners } = voteWinners(ev.id, c.id);
      const my = S.votes.find((v) => v.evening_id === ev.id && v.category === c.id && v.voter_id === S.me);
      return `<div class="vote-cat">
        <div class="vote-title"><span>${c.emoji}</span><span>${c.label}</span>${winners.length ? `<span class="badge gold" style="margin-left:auto">${winners.map((w) => esc(player(w)?.name)).join(" & ")}</span>` : ""}</div>
        <div class="vote-opts">${opts.map((p) => `<button class="vopt ${my?.target_id === p.id ? "mine" : ""}" data-act="vote" data-ev="${ev.id}" data-c="${c.id}" data-p="${p.id}">${avatar(p, 22)}${esc(p.name)}${counts[p.id] ? `<span class="vc">${counts[p.id]}</span>` : ""}</button>`).join("")}</div>
      </div>`;
    }).join("");
    return `<div class="card section"><div class="section-head"><h3>Abstimmung</h3><span class="muted small">Nochmal tippen nimmt die Stimme zurück</span></div>${cats}</div>`;
  }

  // --- Exen ---
  function viewWatch() {
    const w = S.watch;
    if (!player(w.player) || !player(w.player).active) w.player = S.me;
    const best = bestChugs(w.kind);
    const rec = best[0];
    const pb = best.find((c) => c.player_id === w.player);
    const all = S.chugs.filter((c) => c.kind === w.kind && player(c.player_id)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 15);
    return `
      <div class="section">
        <div class="seg">${CHUG_KEYS.map((k) => `<button class="${w.kind === k ? "on" : ""}" data-act="wkind" data-k="${k}">${DRINKS[k].emoji} ${DRINKS[k].label} ${DRINKS[k].size}</button>`).join("")}</div>
        <div class="chips">${activePlayers().map((p) => `<button class="chip ${w.player === p.id ? "on" : ""}" style="--pc:${esc(p.color)}" data-act="wplayer" data-p="${p.id}">${avatar(p, 28)}${esc(p.name)}</button>`).join("")}</div>
      </div>
      <div class="card watch">
        <div class="time num" id="w-time">0,00<small> s</small></div>
        <div class="muted small" style="text-align:center">${rec ? `Rekord: ${fmtMs(rec.ms)} (${esc(player(rec.player_id)?.name)})` : "Noch kein Rekord – setz den ersten!"}${pb ? ` · Bestzeit ${esc(player(w.player)?.name)}: ${fmtMs(pb.ms)}` : ""}</div>
        <div id="w-controls"></div>
      </div>
      <div class="card section">
        <h3>Top 5 · ${DRINKS[w.kind].label} ${DRINKS[w.kind].size}</h3>
        ${rankList(best.slice(0, 5).map((c) => ({ p: player(c.player_id), val: fmtMs(c.ms) + chugVideoBtn(c) })))}
      </div>
      <div class="card section">
        <div class="section-head"><h3>Letzte Versuche</h3>${isAdmin() ? '<span class="badge gold">Admin</span>' : ""}</div>
        ${all.length ? `<div class="list">${all.map((c) => `<div class="li">${avatar(player(c.player_id), 30)}<div class="grow"><b>${esc(player(c.player_id).name)}</b><span class="muted small">${fmtDate(c.created_at)} · ${fmtTime(c.created_at)}</span></div><span class="val">${fmtMs(c.ms)}</span>${chugVideoBtn(c, true)}${canDelete("chugs", c) ? `<button class="icon-btn" data-act="del" data-t="chugs" data-id="${c.id}" aria-label="Löschen">✕</button>` : ""}</div>`).join("")}</div>` : `<div class="empty">Noch keine Versuche.</div>`}
        ${isAdmin() ? "" : `<div class="muted small">Eigene Fehleinträge kannst du 10 Minuten lang löschen, danach nur Georg.</div>`}
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
  function tick() { const w = S.watch; stopRaf(); const loop = () => { setTime(performance.now() - w.start); w.raf = requestAnimationFrame(loop); }; loop(); }
  function stopRaf() { if (S.watch.raf) cancelAnimationFrame(S.watch.raf); S.watch.raf = 0; }
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && "wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  // --- Stats ---
  function rankList(rows) {
    if (!rows.length) return `<div class="empty">Noch keine Einträge.</div>`;
    return `<div class="list">${rows.map((r, i) => `<div class="li"><span class="rank ${i === 0 ? "r1" : ""}">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>${avatar(r.p, 32)}<div class="grow"><b>${esc(r.p?.name)}</b>${r.sub ? `<span class="muted small">${r.sub}</span>` : ""}</div><span class="val">${r.val}</span></div>`).join("")}</div>`;
  }
  function viewStats() {
    return `
      <div class="seg big">
        <button class="${S.statsView === "ranglisten" ? "on" : ""}" data-act="stats-view" data-v="ranglisten">🏆 Ranglisten</button>
        <button class="${S.statsView === "abende" ? "on" : ""}" data-act="stats-view" data-v="abende">📜 Abende</button>
        <button class="${S.statsView === "monat" ? "on" : ""}" data-act="stats-view" data-v="monat">✨ Monat</button>
      </div>
      ${S.statsView === "abende" ? viewBack() : S.statsView === "monat" ? viewMonth() : viewRank()}`;
  }
  function viewRank() {
    const k = S.rankKind;
    const best = bestChugs(k);
    const tot = {};
    const wat = {};
    S.drinks.forEach((d) => {
      if (!isAlc(d)) { wat[d.player_id] = (wat[d.player_id] || 0) + 1; return; }
      const t = (tot[d.player_id] ||= { n: 0, l: 0 }); t.n++; t.l += alcL(d);
    });
    const waterRows = Object.entries(wat).filter(([id]) => player(id)).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ p: player(id), val: `${n} × 💧`, sub: tot[id] ? `1 Wasser auf ${(tot[id].n / n).toFixed(1).replace(".", ",")} Getränke` : "" }));
    const drinkRows = Object.entries(tot).filter(([id]) => player(id)).sort((a, b) => b[1].l - a[1].l).map(([id, t]) => ({ p: player(id), val: fmtL(t.l), sub: `${t.n} Getränke` }));
    const pk = {};
    S.pukes.forEach((x) => (pk[x.player_id] = (pk[x.player_id] || 0) + 1));
    const pukeRows = Object.entries(pk).filter(([id]) => player(id)).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ p: player(id), val: `${n} × 🤮` }));
    const { dep, lastMan, firstOut } = departureStats();
    const depRows = Object.entries(dep).filter(([id]) => player(id)).sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n)
      .map(([id, d]) => ({ p: player(id), val: "Ø " + nightMinToClock(d.sum / d.n), sub: `${firstOut[id] || 0}× Erster heim · ${lastMan[id] || 0}× Letzter Mann` }));
    const titles = {};
    S.evenings.forEach((ev) => VOTE_CATS.forEach((c) => voteWinners(ev.id, c.id).winners.forEach((w) => { (titles[w] ||= {})[c.id] = (titles[w][c.id] || 0) + 1; })));
    const titleBlock = VOTE_CATS.map((c) => {
      const rows = Object.entries(titles).filter(([id, t]) => player(id) && t[c.id]).sort((a, b) => b[1][c.id] - a[1][c.id]).map(([id, t]) => ({ p: player(id), val: `${t[c.id]}×` }));
      return `<div class="card section"><h3>${c.emoji} ${c.label}: meiste Titel</h3>${rankList(rows)}</div>`;
    }).join("");
    return `
      <div class="card section">
        <h3>⏱️ Schnellstes Exen</h3>
        <div class="seg">${CHUG_KEYS.map((x) => `<button class="${k === x ? "on" : ""}" data-act="rkind" data-k="${x}">${DRINKS[x].label} ${DRINKS[x].size}</button>`).join("")}</div>
        ${rankList(best.map((c) => ({ p: player(c.player_id), val: fmtMs(c.ms) + chugVideoBtn(c), sub: fmtDate(c.created_at) })))}
      </div>
      <div class="card section"><h3>🍺 Ewige Trinker-Tabelle</h3>${rankList(drinkRows)}</div>
      <div class="card section"><h3>🤮 Kotz-Counter</h3>${rankList(pukeRows)}</div>
      <div class="card section"><h3>💧 Vernünftigster Bua</h3>${rankList(waterRows)}</div>
      <div class="card section"><h3>🏠 Wer geht am frühesten heim?</h3>${rankList(depRows)}<div class="muted small">Zählt nur beendete Abende. Wer sich nicht abmeldet, gilt bis zum Abend-Ende als da.</div></div>
      ${titleBlock}`;
  }
  function eveningItem(ev) {
    const st = eveningStats(ev);
    const d = new Date(ev.started_at);
    const mvp = voteWinners(ev.id, "mvp").winners.map((w) => player(w)?.name).filter(Boolean);
    return `<button class="evening-item" data-act="open-evening" data-id="${ev.id}">
      <div class="date"><b>${d.getDate()}</b><span>${d.toLocaleDateString("de-DE", { month: "short" }).replace(".", "")}</span></div>
      <div style="min-width:0;flex:1"><b style="display:block">${esc(evName(ev))}${ev.ended_at ? "" : ' <span class="badge home">läuft</span>'}</b>
      <span class="muted small">${st.drinks.length} Getränke · ${fmtL(st.liters)}${st.pukes.length ? ` · 🤮 ${st.pukes.length}` : ""}${mvp.length ? ` · 👑 ${esc(mvp.join(" & "))}` : ""}</span></div>
      <span class="muted">›</span></button>`;
  }
  function viewBack() {
    const evs = S.evenings.slice().sort((a, b) => b.started_at.localeCompare(a.started_at));
    const totL = S.drinks.reduce((s, d) => s + alcL(d), 0);
    const beers = S.drinks.filter((d) => d.kind === "helles" || d.kind === "halbe").length;
    const kaesten = kastenCount(S.drinks);
    const year = new Date().getFullYear();
    const yearEvs = evs.filter((e) => new Date(e.started_at).getFullYear() === year);
    return `
      <div class="hero">
        <h3>Gesamtbilanz</h3>
        <div class="big-stats">
          <div class="stat"><b>${evs.length}</b><span>Abende</span></div>
          <div class="stat"><b>${fmtL(totL)}</b><span>Getrunken</span></div>
          <div class="stat"><b>${beers}</b><span>Bier</span></div>
        </div>
        <div class="muted small">≈ ${kaesten.toFixed(1).replace(".", ",")} Kästen Bier · ${yearEvs.length} Abende in ${year} · ${S.pukes.length}× gekotzt · ${S.chugs.length}× geext · ${S.media.length} Fotos & Videos</div>
      </div>
      <div class="section">${evs.length ? evs.map(eveningItem).join("") : `<div class="empty">Noch kein Abend. Starte im Tab „Abend“ den ersten.</div>`}</div>`;
  }
  function openEvening(id, keepScroll) {
    const ev = byId(S.evenings, id);
    if (!ev) return closeSheet();
    const st = eveningStats(ev);
    const per = st.players.map((p) => { const ds = st.drinks.filter((d) => d.player_id === p.id); return { p, n: ds.length, l: ds.reduce((s, d) => s + alcL(d), 0), w: st.waters.filter((d) => d.player_id === p.id).length }; }).sort((a, b) => b.l - a.l);
    const maxL = Math.max(0.01, ...per.map((x) => x.l));
    const pn = (pid) => esc(player(pid)?.name || "?");
    const timeline = [
      { t: ev.started_at, txt: "Abend gestartet" },
      ...st.all.map((d) => ({ t: d.created_at, txt: `${DRINKS[d.kind]?.emoji} ${pn(d.player_id)}: ${DRINKS[d.kind]?.label}`, table: "drinks", row: d })),
      ...st.departures.map((d) => ({ t: d.left_at, txt: `🏠 ${pn(d.player_id)} geht heim`, table: "departures", row: d })),
      ...st.pukes.map((x) => ({ t: x.created_at, txt: `🤮 ${pn(x.player_id)} kotzt`, table: "pukes", row: x })),
      ...st.chugs.map((c) => ({ t: c.created_at, txt: `⏱️ ${pn(c.player_id)} ext ${DRINKS[c.kind]?.label} in ${fmtMs(c.ms)}`, table: "chugs", row: c })),
      ...(ev.ended_at ? [{ t: ev.ended_at, txt: "Abend beendet" }] : []),
    ].sort((a, b) => b.t.localeCompare(a.t));
    const scroll = keepScroll ? $(".sheet").scrollTop : 0;
    openSheet(`
      <div><h2>${esc(evName(ev))}</h2>
      <div class="muted small">${fmtDate(ev.started_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${fmtTime(ev.started_at)}–${ev.ended_at ? fmtTime(ev.ended_at) : "läuft"} · ${fmtDur(st.duration)}</div></div>
      <div class="big-stats">
        <div class="stat"><b>${st.drinks.length}</b><span>Getränke</span></div>
        <div class="stat"><b>${fmtL(st.liters)}</b><span>Liter</span></div>
        <div class="stat"><b>${st.pukes.length}</b><span>Kotzer</span></div>
      </div>
      <div class="section"><h3>Wer hat wie viel</h3>
        <div class="list">${per.map((x) => `<div class="li">${avatar(x.p, 32)}<div class="grow"><b>${esc(x.p.name)}</b><div class="bar" style="--pc:${esc(x.p.color)}"><i style="width:${(x.l / maxL) * 100}%"></i></div></div><span class="val">${fmtL(x.l)}<br><span class="muted small">${x.n}×</span></span></div>`).join("") || `<div class="empty">Nichts eingetragen.</div>`}</div>
      </div>
      ${st.media.length ? `<div class="section"><div class="section-head"><h3>📸 Album (${st.media.length})</h3><button class="btn sm ghost" data-act="upload" data-ev="${ev.id}">+ Hinzufügen</button></div>${mediaGrid(st.media)}</div>` : `<button class="btn ghost block" data-act="upload" data-ev="${ev.id}">📸 Fotos/Videos zu diesem Abend hinzufügen</button>`}
      ${ev.ended_at ? voteBlock(ev) : ""}
      ${kastenBlock(ev, per)}
      ${chatSummary(ev)}
      <div class="section"><div class="section-head"><h3>Verlauf</h3>${isAdmin() ? '<span class="muted small">✕ löscht einen Eintrag</span>' : ""}</div>
        <div class="timeline">${timeline.map((x) => `<div class="tl"><span class="num">${fmtTime(x.t)}</span><span class="grow">${x.txt}</span>${x.table && canDelete(x.table, x.row) ? `<button class="icon-btn" data-act="del" data-t="${x.table}" data-id="${x.row.id}" aria-label="Eintrag löschen">✕</button>` : ""}</div>`).join("")}</div>
      </div>
      <div class="row">
        <button class="btn ghost" data-act="close">Schließen</button>
        ${isAdmin() ? `<button class="btn ghost" data-act="del-evening" data-id="${ev.id}" style="color:var(--red)">Abend löschen</button>` : ""}
      </div>`);
    S.openEvening = id;
    if (keepScroll) $(".sheet").scrollTop = scroll;
  }

  // --- Profil & Crew ---
  function viewProfile() {
    const p = me();
    const t = playerTotals(p.id);
    const titleStr = VOTE_CATS.filter((c) => t.titles[c.id]).map((c) => `${c.emoji} ${t.titles[c.id]}× ${c.label}`).join(" · ");
    const crew = S.players.slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    return `
      <div class="profile-hero" style="--pc:${esc(p.color)}">
        <button class="avatar-edit" data-act="photo" aria-label="Profilbild ändern">${avatar(p, 96)}<span class="cam">📷</span></button>
        <div style="min-width:0">
          <h2>${esc(p.name)}</h2>
          <div class="muted small">${p.is_admin ? '<span class="badge gold">★ Admin</span> ' : ""}${t.evenings} Abende dabei</div>
        </div>
      </div>
      <input type="file" id="photo-input" accept="image/*" hidden>
      <div class="big-stats">
        <div class="stat"><b>${t.n}</b><span>Getränke</span></div>
        <div class="stat"><b>${fmtL(t.l)}</b><span>Liter</span></div>
        <div class="stat"><b>${t.water}</b><span>Wasser</span></div>
      </div>
      <div class="card section">
        <h3>Bestzeiten</h3>
        <div class="list">${CHUG_KEYS.map((k) => `<div class="li"><span style="font-size:20px">${DRINKS[k].emoji}</span><div class="grow"><b>${DRINKS[k].label} ${DRINKS[k].size}</b></div><span class="val">${t.best[k] ? fmtMs(t.best[k]) : "–"}</span></div>`).join("")}</div>
        ${titleStr ? `<div class="small">${titleStr}</div>` : ""}
      </div>
      ${achievementsBlock(p.id)}
      <div class="card section">
        <h3>Mein Profil</h3>
        <div class="settings">
          <button class="set-row" data-act="edit-player" data-p="${p.id}"><span>✏️</span><span class="grow">Name, Farbe & Emoji</span><span class="muted">›</span></button>
          <button class="set-row" data-act="photo"><span>📷</span><span class="grow">Profilbild ${p.avatar ? "ändern" : "hinzufügen"}</span><span class="muted">›</span></button>
          ${p.avatar ? `<button class="set-row" data-act="photo-remove"><span>🗑️</span><span class="grow">Profilbild entfernen</span></button>` : ""}
          <button class="set-row" data-act="change-pin"><span>🔒</span><span class="grow">PIN ändern</span><span class="muted">›</span></button>
          <button class="set-row" data-act="logout"><span>🚪</span><span class="grow">Abmelden</span></button>
        </div>
      </div>
      <div class="card section">
        <div class="section-head"><h3>Crew (${S.players.length})</h3>${isAdmin() ? `<button class="btn sm gold" data-act="add-player-sheet">+ Neuer Bua</button>` : ""}</div>
        <div class="list">${crew.map((c) => `<div class="li" style="${c.active ? "" : "opacity:.5"}">${avatar(c, 36)}<div class="grow"><b>${esc(c.name)}${c.is_admin ? ' <span class="crown">★</span>' : ""}</b><span class="muted small">${!c.active ? "ausgeblendet" : c.claimed ? "angemeldet" : "noch nicht übernommen"}</span></div>${isAdmin() ? `<button class="btn sm ghost" data-act="edit-player" data-p="${c.id}">Bearbeiten</button>` : ""}</div>`).join("")}</div>
      </div>
      <div class="card section">
        <h3>📲 App teilen & installieren</h3>
        <div class="small"><b>iPhone:</b> Link in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“.<br><b>Android:</b> In Chrome öffnen → Menü ⋮ → „App installieren“.</div>
        <button class="btn block" data-act="share">🔗 Link kopieren</button>
      </div>
      <div class="muted small" style="text-align:center">Bergbauerbuam · Version 2</div>`;
  }
  function editPlayer(id) {
    const p = player(id);
    if (!p) return;
    const self = id === S.me;
    openSheet(`
      <div class="sheet-head">${avatar(p, 56)}<h2>${self ? "Mein Profil" : esc(p.name)}</h2></div>
      <div class="field"><label for="ep-name">Name</label><input class="input" id="ep-name" maxlength="20" value="${esc(p.name)}"></div>
      <div class="field"><label for="ep-emoji">Emoji statt Buchstabe (wenn kein Bild)</label><input class="input" id="ep-emoji" maxlength="4" value="${esc(p.emoji || "")}" placeholder="z. B. 🐻"></div>
      <div class="field"><label>Farbe</label><div class="swatches" id="ep-colors">${COLORS.map((c) => `<button class="sw ${c === p.color ? "on" : ""}" data-act="pick-color" data-c="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join("")}</div></div>
      <button class="btn gold block" data-act="save-player" data-p="${p.id}">Speichern</button>
      ${isAdmin() && !self ? `
        <div class="settings">
          ${p.avatar ? `<button class="set-row" data-act="photo-remove" data-p="${p.id}"><span>🗑️</span><span class="grow">Profilbild entfernen</span></button>` : ""}
          ${p.claimed ? `<button class="set-row" data-act="reset-pin" data-p="${p.id}"><span>🔓</span><span class="grow">PIN zurücksetzen</span></button>` : ""}
          <button class="set-row" data-act="toggle-player" data-p="${p.id}"><span>${p.active ? "🙈" : "👀"}</span><span class="grow">${p.active ? "Ausblenden (Statistik bleibt)" : "Wieder aktivieren"}</span></button>
        </div>` : ""}
      <button class="btn ghost block" data-act="close">Abbrechen</button>`);
  }
  function addPlayerSheet() {
    openSheet(`
      <h2>Neuer Bua</h2>
      <div class="field"><label for="np-name">Name</label><input class="input" id="np-name" maxlength="20" placeholder="Name oder Spitzname"></div>
      <div class="field"><label>Farbe</label><div class="swatches" id="np-colors">${COLORS.map((c, i) => `<button class="sw ${i === S.players.length % COLORS.length ? "on" : ""}" data-act="pick-color" data-c="${c}" style="background:${c}" aria-label="Farbe ${c}"></button>`).join("")}</div></div>
      <p class="muted small" style="margin:0">Beim ersten Öffnen wählt er seinen Namen und legt seine eigene PIN fest.</p>
      <button class="btn gold block" data-act="add-player">Hinzufügen</button>
      <button class="btn ghost block" data-act="close">Abbrechen</button>`);
  }
  function changePinSheet() {
    openSheet(`
      <h2>PIN ändern</h2>
      <div class="field"><label for="pin-old">Aktuelle PIN</label><input class="input pin" id="pin-old" inputmode="numeric" maxlength="4"></div>
      <div class="field"><label for="pin-new">Neue PIN (4 Ziffern)</label><input class="input pin" id="pin-new" inputmode="numeric" maxlength="4"></div>
      <button class="btn gold block" data-act="save-pin">Speichern</button>
      <button class="btn ghost block" data-act="close">Abbrechen</button>`);
  }
  async function updatePlayer(id, fields) {
    const p = player(id);
    const next = Object.assign({ name: p.name, color: p.color, emoji: p.emoji, avatar: p.avatar, active: p.active }, fields);
    await rpc("bbb_update_player", { p_target: id, p_name: next.name, p_color: next.color, p_emoji: next.emoji || "", p_avatar: next.avatar || null, p_active: next.active });
    Object.assign(p, next);
    render();
  }
  function resizeImage(file, size = 256) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht gelesen werden")); };
      img.src = url;
    });
  }

  // ---------- Spiele ----------
  const GAMES = [
    { id: "ring", cat: "karten", name: "Ring of Fire", emoji: "🔥", desc: "Karte ziehen, Regel befolgen. Der 4. König trinkt den Becher." },
    { id: "bus", cat: "karten", name: "Busfahrer", emoji: "🚌", desc: "Vier Fragen richtig, sonst trinken und von vorn." },
    { id: "eher", cat: "fragen", name: "Wer würde eher …", emoji: "👉", desc: "Auf 3 zeigen alle auf jemanden. Die meisten Finger trinken." },
    { id: "nie", cat: "fragen", name: "Ich hab noch nie …", emoji: "🙊", desc: "Wer es schon gemacht hat, trinkt." },
    { id: "rad", cat: "action", name: "Glücksrad", emoji: "🎡", desc: "Wer trinkt? Wie viel? Das Rad entscheidet." },
    { id: "wuerfel", cat: "karten", name: "Würfel", emoji: "🎲", desc: "Zwei Würfel für Mäxchen, Schocken & Co." },
  ];
  const SUITS = [{ s: "♥", red: true }, { s: "♦", red: true }, { s: "♠", red: false }, { s: "♣", red: false }];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "B", "D", "K", "A"];
  const RING_RULES = {
    A: ["Wasserfall", "Alle fangen gleichzeitig an zu trinken. Du darfst erst aufhören, wenn dein rechter Nachbar aufhört."],
    "2": ["Du", "Bestimme, wer zwei Schluck trinkt."],
    "3": ["Ich", "Du trinkst selbst drei Schluck."],
    "4": ["Boden", "Alle berühren den Boden. Der Letzte trinkt."],
    "5": ["Daumenmeister", "Leg irgendwann unauffällig den Daumen auf den Tisch. Wer zuletzt nachzieht, trinkt. Gilt bis zur nächsten 5."],
    "6": ["Buam", "Alle Buam trinken einen Schluck. Prost!"],
    "7": ["Himmel", "Alle zeigen nach oben. Der Letzte trinkt."],
    "8": ["Partner", "Such dir einen Trinkpartner. Wenn du trinkst, trinkt er mit, bis zur nächsten 8."],
    "9": ["Reim", "Sag ein Wort. Reihum reimen, wer nichts mehr weiß, trinkt."],
    "10": ["Kategorie", "Nenn eine Kategorie (z. B. Biermarken). Reihum Begriffe nennen, wer nichts weiß, trinkt."],
    B: ["Regel", "Stell eine neue Regel auf, die bis zum Ende gilt. Wer sie bricht, trinkt."],
    D: ["Fragenmeister", "Wer dir eine Frage beantwortet, trinkt. Gilt bis zur nächsten Dame."],
    K: ["König", "Gieß einen Schluck in den Becher in der Mitte. Der vierte König trinkt ihn aus!"],
  };
  const EHER = [
    "… beim Heimweg einschlafen", "… als Erster heimgehen", "… morgen nichts mehr wissen", "… im Club rausgeworfen werden",
    "… einen Kasten allein schaffen", "… sein Handy verlieren", "… mit dem Türsteher diskutieren", "… um 4 Uhr noch Döner holen",
    "… beim Exen verschlucken", "… beim Kartenspielen bescheißen", "… sich ein peinliches Tattoo stechen lassen", "… den letzten Bus verpassen",
    "… mit der Ex schreiben", "… am Wochenende schon um 10 Uhr ein Bier aufmachen", "… Millionär werden", "… beim Karaoke ans Mikro gehen",
    "… im Urlaub verloren gehen", "… den Grill abfackeln", "… als Erster heiraten", "… einen Abend komplett nüchtern bleiben",
    "… seinen Geldbeutel daheim vergessen", "… beim Tanzen den Boden küssen", "… einen Kater mit noch mehr Bier bekämpfen", "… beim Gaming ausrasten",
    "… die Rechnung für alle zahlen", "… den Schlüssel steckenlassen", "… mit dem Chef einen trinken gehen", "… beim Bergsteigen umdrehen",
  ];
  const NIE = [
    "… einen Filmriss gehabt", "… in einer Bar eingeschlafen", "… mein Handy beim Feiern verloren", "… im Club rausgeflogen",
    "… mit fremden Leuten Brüderschaft getrunken", "… einen Kater geschwänzt", "… mich auf einer Party verlaufen", "… betrunken jemandem geschrieben, den ich bereue",
    "… ein Bier unter 5 Sekunden geext", "… auf einem Tisch getanzt", "… den letzten Zug verpasst", "… unterm Tisch geschlafen",
    "… Bier aus einem Schuh getrunken", "… nach dem Feiern Pizza um 5 Uhr bestellt", "… einen Kumpel nach Hause getragen", "… an der Tankstelle Party gemacht",
    "… im Urlaub was Illegales gegessen", "… an einem Abend mehr als 10 Bier getrunken", "… nach einer Nacht im falschen Bett aufgewacht", "… ein Wiesn-Zelt nicht mehr gefunden",
    "… einen Pokal gewonnen", "… auf Karaoke gesungen", "… was angezündet, was nicht brennen sollte", "… heimlich das Bier von jemand anderem getrunken",
    "… mich bei einem Spiel komplett blamiert", "… mit der Polizei Selfies gemacht", "… beim Kartenspielen bescheißen müssen", "… den Kasten allein geschleppt",
  ];
  const WHEEL_AMOUNTS = ["1 Schluck", "2 Schluck", "3 Schluck", "Exen!", "Verteil 3", "Joker – nix", "Alle trinken", "Wasser trinken 💧"];

  const CATS = [
    { id: "party", label: "🎉 Party-Modus" },
    { id: "karten", label: "🃏 Karten & Würfel" },
    { id: "action", label: "⚡ Action" },
    { id: "fragen", label: "💬 Fragen & Raten" },
  ];
  const allGames = () => GAMES.concat(EXTRA.games);
  function viewGames() {
    if (!S.game) {
      return `
        <h2>Spiele</h2>
        ${CATS.map((c) => `<div class="section"><h3>${c.label}</h3><div class="games">${allGames().filter((g) => g.cat === c.id).map((g) => `<button class="game ${g.cat === "party" ? "featured" : ""}" data-act="game" data-g="${g.id}"><span class="game-e">${g.emoji}</span><b>${g.name}</b><span class="muted small">${g.desc}</span></button>`).join("")}</div></div>`).join("")}
        <div class="muted small" style="text-align:center">Trinkt bewusst. Wasser zwischendurch macht den Abend länger. 💧</div>`;
    }
    const g = allGames().find((x) => x.id === S.game);
    if (g.view) return `<div class="game-top"><button class="btn sm ghost" data-act="game-back">‹ Spiele</button><h2>${g.emoji} ${g.name}</h2></div>${g.view()}`;
    const body = { ring: gameRing, bus: gameBus, eher: () => gamePrompt(EHER, "Wer würde eher …", "Auf 3 zeigen alle auf jemanden. Wer die meisten Finger abbekommt, trinkt."), nie: () => gamePrompt(NIE, "Ich hab noch nie …", "Wer es schon gemacht hat, trinkt."), rad: gameWheel, wuerfel: gameDice }[S.game]();
    return `<div class="game-top"><button class="btn sm ghost" data-act="game-back">‹ Spiele</button><h2>${g.emoji} ${g.name}</h2></div>${body}`;
  }
  function cardHtml(c, big) {
    if (!c) return `<div class="pcard-x back ${big ? "big" : ""}"><span>🍺</span></div>`;
    return `<div class="pcard-x ${c.red ? "red" : ""} ${big ? "big" : ""}"><span class="cr">${c.r}</span><span class="cs">${c.s}</span><span class="cr bottom">${c.r}</span></div>`;
  }
  function newDeck() { const d = []; SUITS.forEach((s) => RANKS.forEach((r, i) => d.push({ r, s: s.s, red: s.red, v: i + 2 }))); return shuffle(d); }

  function gameRing() {
    const g = S.g;
    if (!g.deck) { g.deck = newDeck(); g.drawn = null; g.kings = 0; g.turn = 0; }
    const ps = activePlayers();
    const cur = ps[g.turn % ps.length];
    const rule = g.drawn ? RING_RULES[g.drawn.r] : null;
    const kingTxt = g.drawn?.r === "K" ? (g.kings >= 4 ? "👑 VIERTER KÖNIG! Becher austrinken!" : `König Nr. ${g.kings} von 4`) : "";
    return `
      <div class="card game-stage">
        <div class="muted small">${g.drawn ? "Gezogen von" : "Am Zug"}: <b style="color:var(--foam)">${esc((g.drawn ? g.drawnBy : cur)?.name || "")}</b> · ${g.deck.length} Karten übrig · Könige ${g.kings}/4</div>
        ${cardHtml(g.drawn, true)}
        ${rule ? `<div class="rule"><b>${rule[0]}</b><span>${rule[1]}</span>${kingTxt ? `<span class="badge gold">${kingTxt}</span>` : ""}</div>` : `<div class="rule"><span class="muted">Tipp auf „Karte ziehen“.</span></div>`}
        ${g.deck.length ? `<button class="btn gold block" data-act="ring-draw">Karte ziehen${g.drawn ? ` · weiter: ${esc(cur?.name || "")}` : ""}</button>` : `<div class="rule"><b>Stapel leer!</b></div><button class="btn gold block" data-act="game-reset">Neues Spiel</button>`}
      </div>
      <details class="card rules"><summary><h3 style="display:inline">Alle Regeln</h3></summary><div class="list">${["A", ...RANKS.slice(0, 12)].map((r) => `<div class="li"><b style="width:30px">${r}</b><div class="grow"><b>${RING_RULES[r][0]}</b><span class="muted small">${RING_RULES[r][1]}</span></div></div>`).join("")}</div></details>`;
  }
  function gameBus() {
    const g = S.g;
    if (!g.deck) { g.deck = newDeck(); g.cards = []; g.step = 0; g.tries = 1; g.msg = null; g.driver = g.driver || S.me; g.sips = 0; }
    const ps = activePlayers();
    const qs = [
      { q: "Rot oder Schwarz?", opts: [["rot", "🔴 Rot"], ["schwarz", "⚫ Schwarz"]] },
      { q: "Höher oder tiefer als die erste Karte?", opts: [["hoeher", "⬆️ Höher"], ["tiefer", "⬇️ Tiefer"]] },
      { q: "Innerhalb oder außerhalb der ersten beiden?", opts: [["innen", "↔️ Innerhalb"], ["aussen", "⤢ Außerhalb"]] },
      { q: "Welche Farbe?", opts: [["♥", "♥"], ["♦", "♦"], ["♠", "♠"], ["♣", "♣"]] },
    ];
    const done = g.step >= 4;
    return `
      <div class="chips">${ps.map((p) => `<button class="chip ${g.driver === p.id ? "on" : ""}" style="--pc:${esc(p.color)}" data-act="bus-driver" data-p="${p.id}">${avatar(p, 28)}${esc(p.name)}</button>`).join("")}</div>
      <div class="card game-stage">
        <div class="muted small">Busfahrer: <b style="color:var(--foam)">${esc(player(g.driver)?.name || "")}</b> · Versuch ${g.tries} · ${g.sips} Schluck bisher</div>
        <div class="bus-row">${[0, 1, 2, 3].map((i) => cardHtml(g.cards[i])).join("")}</div>
        ${g.msg ? `<div class="rule ${g.msg.ok ? "ok" : "bad"}"><b>${g.msg.t}</b>${g.msg.s ? `<span>${g.msg.s}</span>` : ""}</div>` : ""}
        ${done ? `<div class="rule ok"><b>🎉 Ausgestiegen!</b><span>Nach ${g.tries} ${g.tries === 1 ? "Versuch" : "Versuchen"} und ${g.sips} Schluck.</span></div><button class="btn gold block" data-act="game-reset">Nächster Busfahrer</button>`
          : `<div class="rule"><b>${qs[g.step].q}</b></div><div class="row">${qs[g.step].opts.map(([v, l]) => `<button class="btn ${g.step === 3 && (v === "♥" || v === "♦") ? "red-txt" : ""}" data-act="bus-guess" data-v="${v}">${l}</button>`).join("")}</div>`}
      </div>
      <div class="muted small">Falsch geraten = so viele Schluck wie die Karten-Nummer (1–4), dann von vorn. Gleich hoch zählt als falsch.</div>`;
  }
  function busGuess(v) {
    const g = S.g;
    if (g.deck.length < 4) g.deck = newDeck();
    const c = g.deck.pop();
    const [a, b] = g.cards;
    let ok;
    if (g.step === 0) ok = (v === "rot") === c.red;
    if (g.step === 1) ok = v === "hoeher" ? c.v > a.v : c.v < a.v;
    if (g.step === 2) { const lo = Math.min(a.v, b.v), hi = Math.max(a.v, b.v); ok = v === "innen" ? c.v > lo && c.v < hi : c.v < lo || c.v > hi; }
    if (g.step === 3) ok = v === c.s;
    g.cards[g.step] = c;
    if (ok) { g.step++; g.msg = g.step < 4 ? { ok: true, t: "Richtig! Weiter." } : null; buzz(20); }
    else {
      const n = g.step + 1;
      g.sips += n;
      g.msg = { ok: false, t: `Falsch! ${n} ${n === 1 ? "Schluck" : "Schluck"} trinken.`, s: "Und nochmal von vorn." };
      buzz(80);
      setTimeout(() => { if (S.game === "bus" && !g.msg?.ok) { g.cards = []; g.step = 0; g.tries++; g.msg = { ok: false, t: "Neuer Versuch" }; render(); } }, 1600);
    }
    render();
  }
  function gamePrompt(list, title, rule) {
    const g = S.g;
    if (!g.order) { g.order = shuffle(list); g.i = 0; }
    const txt = g.order[g.i % g.order.length];
    return `
      <div class="card game-stage">
        <div class="prompt-pre">${title}</div>
        <div class="prompt">${esc(txt)}</div>
        <div class="muted small" style="text-align:center">${rule}</div>
        <button class="btn gold block" data-act="prompt-next">Nächste Frage</button>
        <div class="muted small" style="text-align:center">${(g.i % g.order.length) + 1} / ${g.order.length}</div>
      </div>`;
  }
  function gameWheel() {
    const g = S.g;
    g.mode ||= "wer";
    g.items = g.mode === "wer" ? activePlayers().map((p) => ({ label: p.name, color: p.color })) : WHEEL_AMOUNTS.map((l, i) => ({ label: l, color: COLORS[i % COLORS.length] }));
    return `
      <div class="seg"><button class="${g.mode === "wer" ? "on" : ""}" data-act="wheel-mode" data-m="wer">Wer trinkt?</button><button class="${g.mode === "was" ? "on" : ""}" data-act="wheel-mode" data-m="was">Wie viel?</button></div>
      <div class="card game-stage">
        <div class="wheel-wrap"><canvas id="wheel" width="600" height="600"></canvas><div class="wheel-pin">▼</div></div>
        <div class="rule" id="wheel-res">${g.result != null ? `<b>${esc(g.result)}</b>` : `<span class="muted">Dreh am Rad!</span>`}</div>
        <button class="btn gold block" data-act="wheel-spin">🎡 Drehen</button>
      </div>`;
  }
  function drawWheel() {
    const c = $("#wheel");
    if (!c) return;
    const g = S.g, items = g.items, n = items.length, ctx = c.getContext("2d"), R = 290, cx = 300, cy = 300;
    const rot = g.rot || 0;
    ctx.clearRect(0, 0, 600, 600);
    if (!n) return;
    const step = (Math.PI * 2) / n;
    items.forEach((it, i) => {
      const a0 = rot + i * step - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = it.color; ctx.globalAlpha = i % 2 ? 0.82 : 1; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = "#0e1a14"; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + step / 2);
      ctx.fillStyle = "#14110a"; ctx.font = `800 ${n > 6 ? 26 : 32}px Manrope, sans-serif`; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      const label = it.label.length > 14 ? it.label.slice(0, 13) + "…" : it.label;
      ctx.fillText(label, R - 22, 0); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fillStyle = "#0e1a14"; ctx.fill();
    ctx.font = "40px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("🍺", cx, cy + 2);
  }
  function spinWheel() {
    const g = S.g;
    if (g.spinning || !g.items.length) return;
    g.spinning = true; g.result = null;
    const res = $("#wheel-res"); if (res) res.innerHTML = `<span class="muted">…</span>`;
    const start = g.rot || 0, n = g.items.length, step = (Math.PI * 2) / n;
    const target = Math.floor(Math.random() * n);
    // Segment target soll oben unter dem Zeiger landen
    let end = -(target * step + step / 2) + (Math.random() - 0.5) * step * 0.7;
    end += Math.ceil((start - end) / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2 * (5 + Math.floor(Math.random() * 3));
    const dur = 4200, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 4);
    const loop = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      g.rot = start + (end - start) * ease(t);
      drawWheel();
      if (t < 1 && S.game === "rad") requestAnimationFrame(loop);
      else {
        g.spinning = false; g.result = g.items[target].label; buzz(60);
        const r = $("#wheel-res"); if (r) r.innerHTML = `<b>${esc(g.result)}</b>`;
      }
    };
    requestAnimationFrame(loop);
  }
  function gameDice() {
    const g = S.g;
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const d = g.dice || [null, null];
    let note = "";
    if (d[0]) {
      const hi = Math.max(...d), lo = Math.min(...d);
      if (hi === 2 && lo === 1) note = "🎉 MÄXCHEN!";
      else if (hi === lo) note = `${hi}er-Pasch`;
      else note = `Mäxchen-Wert: ${hi}${lo}`;
    }
    return `
      <div class="card game-stage">
        <div class="dice ${g.rolling ? "rolling" : ""}">${d.map((x) => `<span>${x ? faces[x - 1] : "🎲"}</span>`).join("")}</div>
        <div class="rule">${note ? `<b>${note}</b>` : `<span class="muted">Tipp zum Würfeln</span>`}</div>
        <button class="btn gold block" data-act="dice-roll">🎲 Würfeln</button>
      </div>
      <details class="card rules"><summary><h3 style="display:inline">Mäxchen kurz erklärt</h3></summary><p class="small" style="margin:8px 0 0">Würfle verdeckt und sag einen Wert an, der höher sein muss als der vorherige (gerne gelogen). Der Nächste glaubt es und würfelt weiter, oder er deckt auf. Erwischt beim Lügen = trinken, zu Unrecht angezweifelt = der Zweifler trinkt. Reihenfolge: 31 &lt; 32 &lt; … &lt; 65 &lt; Pasch (11 bis 66) &lt; 21 (Mäxchen).</p></details>`;
  }

  // ---------- Extra-Spiele (games.js) ----------
  const EXTRA = window.BBB_GAMES
    ? window.BBB_GAMES({ S, $, esc, avatar, activePlayers, render: () => render(), buzz, shuffle, pick, toast, player })
    : { games: [], actions: {}, stop() {} };

  // ---------- Medien ----------
  const mediaUrl = (m) => sb.storage.from("media").getPublicUrl(m.path).data.publicUrl;
  function mediaThumb(m) {
    const u = esc(mediaUrl(m));
    return m.kind === "video"
      ? `<button class="tile" data-act="media-open" data-id="${m.id}"><video src="${u}#t=0.1" muted playsinline preload="metadata"></video><span class="tile-play">▶</span>${m.chug_id ? '<span class="tile-badge">🏆</span>' : ""}</button>`
      : `<button class="tile" data-act="media-open" data-id="${m.id}"><img src="${u}" alt="${esc(m.caption || "Foto")}" loading="lazy"></button>`;
  }
  function mediaGrid(list) {
    const ms = list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    return ms.length ? `<div class="grid3">${ms.map(mediaThumb).join("")}</div>` : `<div class="empty">Noch keine Fotos oder Videos.</div>`;
  }
  function chugVideoBtn(c, allowAdd) {
    const v = S.media.find((m) => m.chug_id === c.id);
    if (v) return ` <button class="mini-btn" data-act="media-open" data-id="${v.id}" aria-label="Video ansehen">🎥</button>`;
    return allowAdd ? ` <button class="mini-btn add" data-act="upload" data-chug="${c.id}" data-ev="${c.evening_id || ""}" aria-label="Video hinzufügen">＋🎥</button>` : "";
  }
  function openMedia(id) {
    const m = byId(S.media, id);
    if (!m) return;
    const p = player(m.player_id);
    const c = m.chug_id ? byId(S.chugs, m.chug_id) : null;
    const ev = m.evening_id ? byId(S.evenings, m.evening_id) : null;
    const u = esc(mediaUrl(m));
    S.openEvening = null;
    openSheet(`
      <div class="viewer">${m.kind === "video" ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`}</div>
      ${c ? `<div class="rule"><b>🏆 ${esc(player(c.player_id)?.name)}: ${DRINKS[c.kind]?.label} in ${fmtMs(c.ms)}</b></div>` : ""}
      ${m.caption ? `<div style="font-weight:700">${esc(m.caption)}</div>` : ""}
      <div class="muted small">${p ? esc(p.name) + " · " : ""}${fmtDate(m.created_at)} ${fmtTime(m.created_at)}${ev ? " · " + esc(evName(ev)) : ""}</div>
      <div class="row">
        <button class="btn ghost" data-act="${ev ? "open-evening" : "close"}" data-id="${ev?.id || ""}">${ev ? "Zum Abend" : "Schließen"}</button>
        ${canDelete("media", m) ? `<button class="btn ghost" data-act="media-del" data-id="${m.id}" style="color:var(--red)">Löschen</button>` : ""}
      </div>`);
  }
  function resizeMax(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verarbeitet werden"))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht gelesen werden")); };
      img.src = url;
    });
  }
  function startUpload(target) {
    S.upTarget = target;
    const inp = $("#media-input");
    inp.accept = target.chug ? "video/*" : "image/*,video/*";
    inp.value = "";
    inp.click();
  }
  function uploadSheet(file) {
    const isVideo = file.type.startsWith("video/");
    if (isVideo && file.size > 50 * 1024 * 1024) return toast("Video ist zu groß (max. 50 MB). Schneid es kürzer.");
    S.upFile = file;
    const prev = URL.createObjectURL(file);
    S.openEvening = null;
    openSheet(`
      <h2>${S.upTarget.chug ? "Rekord-Video" : S.upTarget.chat ? "Foto in den Chat" : "Zum Album hinzufügen"}</h2>
      <div class="viewer">${isVideo ? `<video src="${prev}" controls playsinline muted></video>` : `<img src="${prev}" alt="">`}</div>
      <div class="field"><label for="up-caption">Beschreibung (optional)</label><input class="input" id="up-caption" maxlength="140" placeholder="z. B. Hansi nach der dritten Halben"></div>
      <button class="btn gold block" data-act="do-upload">Hochladen</button>
      <button class="btn ghost block" data-act="close">Abbrechen</button>`);
  }
  async function doUpload(btn) {
    const file = S.upFile, t = S.upTarget || {};
    if (!file) return;
    const caption = ($("#up-caption")?.value || "").trim() || null;
    const isVideo = file.type.startsWith("video/");
    btn.textContent = "Lädt hoch …";
    try {
      const blob = isVideo ? file : await resizeMax(file);
      const ext = isVideo ? ((file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4") : "jpg";
      const ev = t.ev || null;
      const path = `${ev || "allgemein"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from("media").upload(path, blob, { contentType: isVideo ? file.type || "video/mp4" : "image/jpeg", upsert: false });
      if (error) throw error;
      const m = await insert("media", { evening_id: ev, player_id: S.me, chug_id: t.chug || null, kind: isVideo ? "video" : "photo", path, caption: t.chat ? null : caption });
      if (t.chat) await insert("messages", { evening_id: ev, player_id: S.me, body: caption, media_id: m.id });
      S.upFile = null;
      closeSheet();
      toast(isVideo ? "Video hochgeladen 🎥" : "Foto hochgeladen 📸");
      if (t.chat) S.scrollChat = true;
      render();
    } catch (e) {
      console.error(e);
      btn.textContent = "Nochmal versuchen";
      toast("Upload fehlgeschlagen: " + errMsg(e));
    }
  }

  // ---------- Chat ----------
  const REACTS = ["🍺", "😂", "🔥", "🤮", "👑", "❤️"];
  function chatItems(ev) {
    const evId = ev?.id || null;
    const msgs = S.messages.filter((m) => (m.evening_id || null) === evId).map((m) => ({ t: m.created_at, msg: m }));
    if (!ev) return msgs.sort((a, b) => a.t.localeCompare(b.t)).slice(-200);
    const linked = new Set(S.messages.map((m) => m.media_id).filter(Boolean));
    const pn = (id) => esc(player(id)?.name || "?");
    const events = [
      { t: ev.started_at, ev: "🍺 Abend gestartet. Prost!" },
      ...S.chugs.filter((c) => c.evening_id === evId).map((c) => ({ t: c.created_at, ev: `⏱️ ${pn(c.player_id)} ext ${DRINKS[c.kind]?.label} ${DRINKS[c.kind]?.size} in ${fmtMs(c.ms)}${bestChugs(c.kind)[0]?.id === c.id ? " · 🏆 REKORD" : ""}` })),
      ...S.departures.filter((d) => d.evening_id === evId).map((d) => ({ t: d.left_at, ev: `🏠 ${pn(d.player_id)} ist heim (${fmtTime(d.left_at)})` })),
      ...S.pukes.filter((x) => x.evening_id === evId).map((x) => ({ t: x.created_at, ev: `🤮 ${pn(x.player_id)} hat gekotzt` })),
      ...S.media.filter((m) => m.evening_id === evId && !linked.has(m.id)).map((m) => ({ t: m.created_at, ev: `📸 ${pn(m.player_id)} hat ${m.kind === "video" ? "ein Video" : "ein Foto"} ins Album gestellt`, media: m })),
      ...(ev.ended_at ? [{ t: ev.ended_at, ev: "🌙 Abend beendet" }] : []),
    ];
    return msgs.concat(events).sort((a, b) => a.t.localeCompare(b.t)).slice(-250);
  }
  function chatHtml(items, readonly) {
    if (!items.length) return `<div class="empty" style="text-align:center;padding:30px 0">Noch nichts los hier. Schreib die erste Nachricht!</div>`;
    let lastDay = "";
    return items.map((it) => {
      const day = fmtDate(it.t, { weekday: "long", day: "numeric", month: "long" });
      const sep = day !== lastDay ? `<div class="chat-day">${day}</div>` : "";
      lastDay = day;
      if (it.ev) return sep + `<div class="chat-event">${it.ev}${it.media ? `<div class="chat-media">${mediaThumb(it.media)}</div>` : ""}<span>${fmtTime(it.t)}</span></div>`;
      const m = it.msg, p = player(m.player_id), mine = m.player_id === S.me;
      const media = m.media_id ? byId(S.media, m.media_id) : null;
      const reacts = Object.entries(m.reactions || {}).filter(([, ids]) => ids?.length);
      return sep + `<div class="msg ${mine ? "mine" : ""}">
        ${mine ? "" : avatar(p, 30)}
        <div class="msg-col">
          ${mine ? "" : `<span class="msg-name" style="color:${esc(p?.color || "#888")}">${esc(p?.name || "?")}</span>`}
          <div class="bubble" ${readonly ? "" : `data-act="msg-open" data-id="${m.id}"`}>
            ${media ? `<div class="chat-media">${mediaThumb(media)}</div>` : ""}
            ${m.body ? `<span>${esc(m.body)}</span>` : ""}
            <span class="msg-time">${fmtTime(m.created_at)}</span>
          </div>
          ${reacts.length ? `<div class="reacts">${reacts.map(([e, ids]) => `<button class="react ${ids.includes(S.me) ? "on" : ""}" ${readonly ? "" : `data-act="react" data-id="${m.id}" data-e="${e}"`}>${e} ${ids.length}</button>`).join("")}</div>` : ""}
        </div>
      </div>`;
    }).join("");
  }
  function viewChat(ev) {
    return `
      <div class="muted small" style="text-align:center">${ev ? `Chat zum ${esc(evName(ev))}. Alles Wichtige vom Abend landet hier automatisch.` : "Stammtisch-Chat. Starte einen Abend, dann gibt es einen eigenen Chat dazu."}</div>
      <div class="chat-list">${chatHtml(chatItems(ev))}</div>
      <form class="composer" data-chat-form>
        <button type="button" class="comp-btn" data-act="upload" data-chat="1" data-ev="${ev?.id || ""}" aria-label="Foto senden">📷</button>
        <input class="input" id="chat-input" maxlength="500" placeholder="Nachricht …" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="comp-btn send" aria-label="Senden">➤</button>
      </form>`;
  }
  function viewAlbum(ev) {
    const list = ev ? S.media.filter((m) => m.evening_id === ev.id) : S.media;
    return `
      <button class="btn gold block" data-act="upload" data-ev="${ev?.id || ""}">📸 Foto oder Video hinzufügen</button>
      <div class="muted small">${ev ? `Album vom ${esc(evName(ev))}. Fotos werden automatisch verkleinert, Videos am besten kurz halten (max. 50 MB).` : "Alle Fotos und Videos. Starte einen Abend, dann landen neue Fotos direkt in dessen Album."}</div>
      ${mediaGrid(list)}`;
  }
  function chatSummary(ev) {
    const n = S.messages.filter((m) => m.evening_id === ev.id).length;
    return n ? `<button class="btn ghost block" data-act="chat-log" data-id="${ev.id}">💬 Chat vom Abend lesen (${n})</button>` : "";
  }
  async function sendChat() {
    const inp = $("#chat-input");
    const body = (inp?.value || "").trim();
    if (!body) return;
    inp.value = "";
    S.scrollChat = true;
    await insert("messages", { evening_id: currentEvening()?.id || null, player_id: S.me, body });
    $("#chat-input")?.focus();
  }

  // ---------- Kasten-Rechner ----------
  function kastenCount(drinks) {
    return drinks.filter((d) => d.kind === "halbe").length / 20 + drinks.filter((d) => d.kind === "helles").length / 24;
  }
  function kastenBlock(ev, per) {
    const st = eveningStats(ev);
    const k = kastenCount(st.drinks);
    const cost = store.get("bbb_cost_" + ev.id) || "";
    const totL = per.reduce((s, x) => s + x.l, 0) || 1;
    return `<div class="section kasten" data-ev="${ev.id}">
      <h3>🧮 Kasten-Rechner</h3>
      <div class="muted small">${st.drinks.filter((d) => d.kind === "halbe").length} Halbe + ${st.drinks.filter((d) => d.kind === "helles").length} Helle ≈ <b style="color:var(--foam)">${k.toFixed(1).replace(".", ",")} Kästen</b></div>
      <div class="field"><label for="cost-${ev.id}">Was hat alles zusammen gekostet? (€)</label><input class="input" id="cost-${ev.id}" data-cost="${ev.id}" inputmode="decimal" placeholder="z. B. 45" value="${esc(cost)}"></div>
      <div class="list">${per.map((x) => `<div class="li">${avatar(x.p, 28)}<div class="grow"><b>${esc(x.p.name)}</b><span class="muted small">${Math.round((x.l / totL) * 100)} % vom Getrunkenen</span></div><span class="val" data-share="${x.l / totL}">–</span></div>`).join("")}</div>
      <div class="muted small">Aufgeteilt nach getrunkenen Litern. Nur auf diesem Handy gespeichert.</div>
    </div>`;
  }
  function updateKasten(root) {
    (root || document).querySelectorAll(".kasten").forEach((k) => {
      const v = parseFloat((k.querySelector("[data-cost]")?.value || "").replace(",", "."));
      k.querySelectorAll("[data-share]").forEach((el) => { el.textContent = v > 0 ? (v * +el.dataset.share).toFixed(2).replace(".", ",") + " €" : "–"; });
    });
  }

  // ---------- Monatsrückblick ----------
  const monthKey = (iso) => iso.slice(0, 7);
  function viewMonth() {
    const months = [...new Set(S.evenings.map((e) => monthKey(e.started_at)))].sort().reverse();
    if (!months.length) return `<div class="empty">Noch keine Abende. Nach dem ersten Abend gibt's hier den Monatsrückblick.</div>`;
    const m = months.includes(S.month) ? S.month : months[0];
    const evs = S.evenings.filter((e) => monthKey(e.started_at) === m);
    const ids = new Set(evs.map((e) => e.id));
    const drinks = S.drinks.filter((d) => ids.has(d.evening_id));
    const alc = drinks.filter(isAlc);
    const liters = alc.reduce((s, d) => s + alcL(d), 0);
    const by = (arr, f = () => 1) => { const o = {}; arr.forEach((x) => { if (player(x.player_id)) o[x.player_id] = (o[x.player_id] || 0) + f(x); }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
    const topL = by(alc, alcL)[0];
    const chugs = S.chugs.filter((c) => monthKey(c.created_at) === m && player(c.player_id)).sort((a, b) => a.ms - b.ms);
    const pukeTop = by(S.pukes.filter((x) => ids.has(x.evening_id)))[0];
    const water = by(drinks.filter((d) => !isAlc(d)))[0];
    const { lastMan } = departureStats(evs.filter((e) => e.ended_at));
    const last = Object.entries(lastMan).filter(([id]) => player(id)).sort((a, b) => b[1] - a[1])[0];
    const mvp = {}; evs.forEach((e) => voteWinners(e.id, "mvp").winners.forEach((w) => (mvp[w] = (mvp[w] || 0) + 1)));
    const mvpTop = Object.entries(mvp).filter(([id]) => player(id)).sort((a, b) => b[1] - a[1])[0];
    const photos = S.media.filter((x) => ids.has(x.evening_id) && x.kind === "photo");
    const bg = photos.length ? `style="background-image:linear-gradient(rgba(14,26,20,.35),rgba(14,26,20,.92)),url('${esc(mediaUrl(pick(photos)))}')"` : "";
    const label = new Date(m + "-15").toLocaleDateString("de-DE", { month: "long", year: "numeric" });
    const slide = (cls, inner, extra = "") => `<div class="slide ${cls}" ${extra}>${inner}</div>`;
    const who = (id, big) => `${avatar(player(id), big || 84)}<b class="slide-name">${esc(player(id)?.name)}</b>`;
    const slides = [
      slide("s-intro", `<span class="slide-pre">Euer Monat</span><b class="slide-big">${label}</b><span>${evs.length} ${evs.length === 1 ? "Abend" : "Abende"} · ${photos.length} Fotos</span>`, bg),
      slide("s-gold", `<span class="slide-pre">Zusammen getrunken</span><b class="slide-big num">${fmtL(liters)}</b><span>${alc.length} Getränke · ≈ ${kastenCount(alc).toFixed(1).replace(".", ",")} Kästen</span>`),
      topL && slide("", `<span class="slide-pre">🍺 Trinker des Monats</span>${who(topL[0])}<span class="num">${fmtL(topL[1])}</span>`),
      chugs[0] && slide("", `<span class="slide-pre">⏱️ Schnellster Ex</span>${who(chugs[0].player_id)}<span class="num">${DRINKS[chugs[0].kind]?.label} in ${fmtMs(chugs[0].ms)}</span>${chugVideoBtn(chugs[0])}`),
      mvpTop && slide("", `<span class="slide-pre">👑 MVP des Monats</span>${who(mvpTop[0])}<span>${mvpTop[1]}× gewählt</span>`),
      last && slide("", `<span class="slide-pre">🌙 Letzter Mann</span>${who(last[0])}<span>${last[1]}× als Letzter heim</span>`),
      pukeTop && slide("s-red", `<span class="slide-pre">🤮 Kotz-König</span>${who(pukeTop[0])}<span>${pukeTop[1]}× gekotzt</span>`),
      water && slide("s-blue", `<span class="slide-pre">💧 Vernünftigster Bua</span>${who(water[0])}<span>${water[1]} Wasser</span>`),
      photos.length && slide("s-photos", `<span class="slide-pre">📸 Momente</span><div class="collage">${shuffle(photos).slice(0, 6).map(mediaThumb).join("")}</div>`),
    ].filter(Boolean);
    return `
      <div class="chips">${months.map((x) => `<button class="chip plain ${x === m ? "on" : ""}" data-act="month-pick" data-m="${x}">${new Date(x + "-15").toLocaleDateString("de-DE", { month: "short", year: "2-digit" })}</button>`).join("")}</div>
      <div class="slides">${slides.join("")}</div>
      <div class="muted small" style="text-align:center">Nach links wischen ›</div>`;
  }

  // ---------- Achievements ----------
  function achievementsBlock(pid) {
    const t = playerTotals(pid);
    const { lastMan } = departureStats();
    const holds = CHUG_KEYS.some((k) => bestChugs(k)[0]?.player_id === pid);
    const prog = (v, max) => [v >= max, `${Math.min(v, max).toLocaleString("de-DE", { maximumFractionDigits: 1 })}/${max}`];
    const list = [
      ["🍺", "Anstich", "Erstes Getränk eingetragen", prog(t.n, 1)],
      ["🍻", "Halbe-Held", "50 Halbe getrunken", prog(t.halbe, 50)],
      ["🛢️", "Hektoliter", "100 Liter insgesamt", prog(Math.floor(t.l), 100)],
      ["⚡", "Blitz", "Halbe unter 5 Sekunden", [t.best.halbe < 5000, t.best.halbe ? fmtMs(t.best.halbe) : "–"]],
      ["🚀", "Turbo", "Helles unter 3 Sekunden", [t.best.helles < 3000, t.best.helles ? fmtMs(t.best.helles) : "–"]],
      ["🏆", "Rekordhalter", "Hält gerade einen Exen-Rekord", [holds, holds ? "Ja" : "Nein"]],
      ["🏠", "Stammgast", "Bei 10 Abenden dabei", prog(t.evenings, 10)],
      ["🌙", "Letzter Mann", "3× als Letzter heim", prog(lastMan[pid] || 0, 3)],
      ["💧", "Vernünftig", "10 Wasser getrunken", prog(t.water, 10)],
      ["👑", "MVP", "Einmal zum MVP gewählt", prog(t.titles.mvp || 0, 1)],
      ["📸", "Paparazzo", "10 Fotos oder Videos", prog(t.uploads, 10)],
      ["🤮", "Ehrenrunde", "Einmal gekotzt", prog(t.pukes, 1)],
    ];
    const got = list.filter((a) => a[3][0]).length;
    return `<div class="card section">
      <div class="section-head"><h3>🏅 Achievements</h3><span class="badge gold">${got}/${list.length}</span></div>
      <div class="ach-grid">${list.map(([e, n, d, [ok, pr]]) => `<div class="ach ${ok ? "ok" : ""}" title="${esc(d)}"><span class="ach-e">${e}</span><b>${n}</b><span class="muted small">${esc(d)}</span><span class="ach-p">${ok ? "✓" : pr}</span></div>`).join("")}</div>
    </div>`;
  }

  // ---------- Sheets ----------
  function confirmSheet(title, text, label, cls, onYes) {
    S.openEvening = null;
    openSheet(`<h2>${title}</h2>${text ? `<p class="muted" style="margin:0">${text}</p>` : ""}<div class="row"><button class="btn ghost" data-act="close">Abbrechen</button><button class="btn ${cls}" data-act="confirm-yes">${label}</button></div>`);
    confirmSheet.cb = onYes;
  }
  function openSheet(html) {
    const body = $("#sheet-body");
    const keep = {};
    body.querySelectorAll("input[id]").forEach((i) => { if (document.activeElement === i) keep[i.id] = i.selectionStart; });
    body.innerHTML = html; $("#sheet").hidden = false; updateKasten(body);
    Object.entries(keep).forEach(([id, pos]) => { const i = document.getElementById(id); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch {} } });
  }
  function closeSheet() { $("#sheet").hidden = true; S.openEvening = null; $("#sheet-body").querySelectorAll("video").forEach((v) => v.pause()); }

  // ---------- Aktionen ----------
  const actions = {
    reload: () => loadAll(),
    close: closeSheet,
    "login-pick": (el) => loginSheet(el.dataset.p),
    "login-go": async (el) => {
      const pin = ($("#pin").value || "").trim();
      if (!/^\d{4}$/.test(pin)) return toast("Die PIN hat 4 Ziffern");
      const ok = await rpc("bbb_claim", { p_player: el.dataset.p, p_pin: pin });
      if (!ok) { $("#pin").value = ""; buzz(80); return toast("Falsche PIN"); }
      S.me = el.dataset.p; S.pin = pin; S.authed = true;
      store.set("bbb_me", S.me); store.set("bbb_pin", pin);
      closeSheet(); await loadAll();
      toast(`Servus, ${player(S.me)?.name}!`);
    },
    logout: () => confirmSheet("Abmelden?", "Danach musst du deinen Namen und deine PIN neu eingeben.", "Abmelden", "red", () => { closeSheet(); logout(); render(); }),
    "start-evening": async () => {
      const title = ($("#ev-title")?.value || "").trim() || null;
      await insert("evenings", { title });
      buzz(30); toast("Abend gestartet. Prost! 🍻");
    },
    "end-evening": () => confirmSheet("Abend beenden?", "Danach landet er unter Stats → Abende. Abstimmen geht dort weiter.", "Beenden", "gold", async () => {
      const ev = currentEvening();
      closeSheet();
      if (ev) await patch("evenings", ev.id, { ended_at: new Date().toISOString() });
      S.tab = "stats"; S.statsView = "abende"; render(); if (ev) openEvening(ev.id);
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
      confirmSheet(`🏠 ${esc(p.name)} geht heim?`, self ? "Gute Heimreise! Schreib in die Gruppe, wenn du daheim bist." : "Du trägst das für " + esc(p.name) + " ein.", "Eintragen", "gold", async () => {
        closeSheet();
        const row = await insert("departures", { evening_id: currentEvening().id, player_id: p.id, entered_by: S.me });
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
      const { ev, c, p } = el.dataset;
      const existing = S.votes.find((v) => v.evening_id === ev && v.category === c && v.voter_id === S.me);
      buzz();
      if (existing && existing.target_id === p) return remove("votes", existing.id);
      if (existing) return patch("votes", existing.id, { target_id: p });
      await insert("votes", { evening_id: ev, category: c, voter_id: S.me, target_id: p });
    },
    del: (el) => {
      const { t, id } = el.dataset;
      const keep = S.openEvening;
      confirmSheet("Eintrag löschen?", "Das kann nicht rückgängig gemacht werden.", "Löschen", "red", async () => {
        closeSheet();
        await remove(t, id);
        toast("Gelöscht");
        if (keep) openEvening(keep);
      });
    },
    "del-evening": (el) => {
      const id = el.dataset.id;
      confirmSheet("Abend löschen?", "Alle Getränke, Heimgänge, Kotzer und Stimmen dieses Abends werden gelöscht. Exen-Zeiten bleiben.", "Endgültig löschen", "red", async () => {
        closeSheet();
        const paths = S.media.filter((m) => m.evening_id === id).map((m) => m.path);
        await remove("evenings", id);
        if (paths.length) sb.storage.from("media").remove(paths).catch(() => {});
        S.media = S.media.filter((m) => m.evening_id !== id); S.messages = S.messages.filter((m) => m.evening_id !== id);
        ["drinks", "departures", "pukes", "votes"].forEach((t) => (S[t] = S[t].filter((r) => r.evening_id !== id)));
        render(); toast("Abend gelöscht");
      });
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
      const w = S.watch, ms = w.result, prev = bestChugs(w.kind)[0];
      w.result = null;
      const row = await insert("chugs", { evening_id: currentEvening()?.id || null, player_id: w.player, kind: w.kind, ms });
      const rec = !prev || ms < prev.ms;
      openSheet(`<div class="rule"><b>${rec ? "🏆 Neuer Rekord!" : "Gespeichert ✓"}</b><span>${esc(player(w.player)?.name)} · ${DRINKS[w.kind].label} in ${fmtMs(ms)}</span></div>
        <p class="muted" style="margin:0;text-align:center">Hat jemand gefilmt? Lade das Video als Beweis hoch. Es erscheint in der Rangliste und im Album.</p>
        <button class="btn gold block" data-act="upload" data-chug="${row.id}" data-ev="${row.evening_id || ""}">🎥 Video hinzufügen</button>
        <button class="btn ghost block" data-act="close">Ohne Video</button>`);
    },
    rkind: (el) => { S.rankKind = el.dataset.k; render(); },
    "stats-view": (el) => { S.statsView = el.dataset.v; render(); },
    "open-evening": (el) => openEvening(el.dataset.id),
    "pick-color": (el) => { el.parentElement.querySelectorAll(".sw").forEach((s) => s.classList.toggle("on", s === el)); },
    "add-player-sheet": addPlayerSheet,
    "add-player": async () => {
      const name = ($("#np-name").value || "").trim();
      if (!name) { $("#np-name").focus(); return toast("Gib einen Namen ein"); }
      const color = $("#np-colors .sw.on")?.dataset.c || COLORS[0];
      await rpc("bbb_add_player", { p_name: name, p_color: color });
      closeSheet(); await loadAll();
      toast(`${name} ist dabei 🤠`);
    },
    "edit-player": (el) => editPlayer(el.dataset.p),
    "save-player": async (el) => {
      const name = ($("#ep-name").value || "").trim();
      if (!name) return toast("Name darf nicht leer sein");
      const emoji = ($("#ep-emoji").value || "").trim() || null;
      const color = $("#ep-colors .sw.on")?.dataset.c;
      await updatePlayer(el.dataset.p, { name, emoji, color });
      closeSheet(); toast("Gespeichert");
    },
    "toggle-player": async (el) => { const p = player(el.dataset.p); await updatePlayer(p.id, { active: !p.active }); closeSheet(); },
    "reset-pin": (el) => {
      const p = player(el.dataset.p);
      confirmSheet(`PIN von ${esc(p.name)} zurücksetzen?`, "Er kann sich danach mit einer neuen PIN wieder anmelden.", "Zurücksetzen", "gold", async () => {
        await rpc("bbb_reset_pin", { p_target: p.id });
        closeSheet(); await loadAll(); toast("PIN zurückgesetzt");
      });
    },
    "change-pin": changePinSheet,
    "save-pin": async () => {
      const o = $("#pin-old").value.trim(), n = $("#pin-new").value.trim();
      if (!/^\d{4}$/.test(n)) return toast("Die neue PIN braucht 4 Ziffern");
      await db(sb.rpc("bbb_change_pin", { p_player: S.me, p_pin: o, p_new: n }));
      S.pin = n; store.set("bbb_pin", n); closeSheet(); toast("PIN geändert");
    },
    photo: (el) => { const inp = $("#photo-input"); if (!inp) return; inp.dataset.p = el.dataset.p || S.me; inp.value = ""; inp.click(); },
    "photo-remove": async (el) => { await updatePlayer(el.dataset.p || S.me, { avatar: null }); closeSheet(); toast("Profilbild entfernt"); },
    share: async () => {
      const url = location.origin + location.pathname;
      try { await navigator.clipboard.writeText(url); toast("Link kopiert. Ab in die Gruppe damit!"); }
      catch { toast(url); }
    },
    game: (el) => { S.game = el.dataset.g; S.g = {}; render(); window.scrollTo(0, 0); },
    "game-back": () => { EXTRA.stop(); S.game = null; S.g = {}; render(); },
    "game-reset": () => { EXTRA.stop(); const d = S.g.driver; S.g = { driver: d }; render(); },
    "ring-draw": () => {
      const g = S.g, ps = activePlayers();
      g.drawnBy = ps[g.turn % ps.length];
      g.drawn = g.deck.pop(); g.turn++;
      if (g.drawn.r === "K") g.kings++;
      buzz(g.drawn.r === "K" && g.kings === 4 ? 200 : 20);
      render();
    },
    "bus-driver": (el) => { S.g = { driver: el.dataset.p }; render(); },
    "bus-guess": (el) => busGuess(el.dataset.v),
    "prompt-next": () => { S.g.i++; buzz(); render(); },
    "wheel-mode": (el) => { if (S.g.spinning) return; S.g = { mode: el.dataset.m }; render(); },
    "wheel-spin": spinWheel,
    "dice-roll": () => {
      const g = S.g;
      g.rolling = true; render();
      setTimeout(() => { g.rolling = false; g.dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]; buzz(30); render(); }, 450);
    },
    "abend-view": (el) => { S.abendView = el.dataset.v; if (S.abendView === "chat") S.scrollChat = true; render(); if (S.abendView !== "chat") window.scrollTo(0, 0); },
    upload: (el) => startUpload({ ev: el.dataset.ev || currentEvening()?.id || null, chug: el.dataset.chug || null, chat: el.dataset.chat === "1" }),
    "do-upload": (el) => doUpload(el),
    "media-open": (el) => openMedia(el.dataset.id),
    "media-del": (el) => {
      const m = byId(S.media, el.dataset.id);
      confirmSheet("Foto/Video löschen?", "Es wird für alle gelöscht.", "Löschen", "red", async () => {
        closeSheet();
        await remove("media", m.id);
        sb.storage.from("media").remove([m.path]).catch(() => {});
        toast("Gelöscht");
      });
    },
    "msg-open": (el) => {
      const m = byId(S.messages, el.dataset.id);
      if (!m) return;
      openSheet(`<h3>Reagieren</h3>
        <div class="react-pick">${REACTS.map((e) => `<button data-act="react" data-id="${m.id}" data-e="${e}" class="${(m.reactions?.[e] || []).includes(S.me) ? "on" : ""}">${e}</button>`).join("")}</div>
        ${canDelete("messages", m) ? `<button class="btn ghost block" data-act="msg-del" data-id="${m.id}" style="color:var(--red)">Nachricht löschen</button>` : ""}
        <button class="btn ghost block" data-act="close">Schließen</button>`);
    },
    react: async (el) => {
      const m = byId(S.messages, el.dataset.id), e = el.dataset.e;
      if (!m) return;
      const r = JSON.parse(JSON.stringify(m.reactions || {}));
      const ids = new Set(r[e] || []);
      ids.has(S.me) ? ids.delete(S.me) : ids.add(S.me);
      r[e] = [...ids];
      if (!r[e].length) delete r[e];
      closeSheet(); buzz();
      await patch("messages", m.id, { reactions: r });
    },
    "msg-del": async (el) => { closeSheet(); await remove("messages", el.dataset.id); },
    "chat-log": (el) => {
      const ev = byId(S.evenings, el.dataset.id);
      S.openEvening = null;
      openSheet(`<h2>💬 ${esc(evName(ev))}</h2><div class="chat-list in-sheet">${chatHtml(chatItems(ev), true)}</div><button class="btn ghost block" data-act="open-evening" data-id="${ev.id}">‹ Zurück zum Abend</button>`);
    },
    "month-pick": (el) => { S.month = el.dataset.m; render(); },
    "confirm-yes": () => confirmSheet.cb && confirmSheet.cb(),
  };

  document.addEventListener("submit", (e) => {
    if (e.target.matches("[data-chat-form]")) { e.preventDefault(); sendChat().catch(() => {}); }
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id === "media-input") { if (e.target.files[0]) uploadSheet(e.target.files[0]); return; }
    if (e.target.id !== "photo-input" || !e.target.files[0]) return;
    try {
      toast("Bild wird hochgeladen …");
      const data = await resizeImage(e.target.files[0]);
      await updatePlayer(e.target.dataset.p || S.me, { avatar: data });
      toast("Profilbild gespeichert 📸");
    } catch (err) { console.error(err); toast(errMsg(err)); }
  });
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const tab = e.target.closest("#tabbar button");
    if (tab) {
      if (S.watch.running) return toast("Erst die Stoppuhr stoppen");
      if (S.tab === tab.dataset.tab && S.tab === "spiele") { EXTRA.stop(); S.game = null; S.g = {}; }
      S.tab = tab.dataset.tab; store.set("bbb_tab", S.tab); render(); window.scrollTo(0, 0); return;
    }
    if (e.target.closest("#me-chip")) { S.tab = "profil"; store.set("bbb_tab", "profil"); render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    if (!actions[el.dataset.act] && EXTRA.actions[el.dataset.act]) return EXTRA.actions[el.dataset.act](el);
    if (!actions[el.dataset.act]) return;
    const lock = el.tagName === "BUTTON" && ["drink", "wsave", "add-player", "start-evening", "confirm-yes", "login-go", "save-player", "save-pin", "do-upload", "chat-send"].includes(el.dataset.act);
    if (lock) el.disabled = true;
    try { await actions[el.dataset.act](el); } catch (err) { console.error(err); }
    finally { if (lock) el.disabled = false; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
    if (e.key === "Enter" && e.target.id === "pin") $("[data-act=login-go]")?.click();
  });
  document.addEventListener("input", (e) => {
    if (e.target.dataset.cost) { store.set("bbb_cost_" + e.target.dataset.cost, e.target.value); updateKasten(); }
    if (e.target.id === "pin" && /^\d{4}$/.test(e.target.value)) $("[data-act=login-go]")?.click();
  });

  // ---------- Start ----------
  render();
  loadAll();
  sb.channel("stube").on("postgres_changes", { event: "*", schema: "public" }, scheduleReload).subscribe();
  setInterval(() => { if (document.visibilityState === "visible" && !S.watch.running && $("#sheet").hidden) loadAll(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") loadAll(); });
  setInterval(() => { if (S.tab === "abend" && currentEvening() && $("#sheet").hidden && !document.activeElement?.matches("input")) render(); }, 60000);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();

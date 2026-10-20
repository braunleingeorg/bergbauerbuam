/* Bergbauerbuam – Party-Spiele (Picolo-Modus, Roulette, Bombe, Duell, Flasche, Imposter, Schätzen) */
window.BBB_GAMES = function (api) {
  "use strict";
  const { S, $, esc, avatar, activePlayers, render, buzz, shuffle, pick, toast } = api;

  // ---------- Inhalte ----------
  // {A}, {B} = zufällige Spieler. type: normal | alle | regel (mit Ende) | duell
  const PARTY = [
    { t: "{A}, verteil 3 Schluck.", type: "normal" },
    { t: "{A} und {B} trinken zusammen 2 Schluck. Prost!", type: "normal" },
    { t: "Alle, die heute schon was gegessen haben, trinken 1 Schluck.", type: "alle" },
    { t: "Wer zuletzt auf dem Klo war, trinkt 2 Schluck.", type: "alle" },
    { t: "{A}, sag drei Biermarken in 5 Sekunden oder trink 2.", type: "normal" },
    { t: "{A} gegen {B}: Schnick-Schnack-Schnuck! Verlierer trinkt 2.", type: "duell" },
    { t: "Wer das älteste Handy hat, trinkt 1 Schluck.", type: "alle" },
    { t: "{A}, nenn jemanden, der heute am lautesten ist. Der trinkt 2.", type: "normal" },
    { t: "Kategorie: Fußballvereine. {A} fängt an, reihum, wer nichts weiß, trinkt.", type: "normal" },
    { t: "Kategorie: Dinge auf einer Alm. {A} beginnt.", type: "normal" },
    { t: "Kategorie: Ausreden, warum man früher heimgeht. {A} beginnt.", type: "normal" },
    { t: "Alle mit Bart trinken 1 Schluck.", type: "alle" },
    { t: "{A}, imitiere {B}. Wenn alle lachen, trinkt {B}, sonst trinkst du.", type: "normal" },
    { t: "{A} darf eine Regel aufstellen, die bis zum Ende gilt.", type: "normal" },
    { t: "Wer als Letzter die Hand hebt, trinkt 2 Schluck. Jetzt!", type: "alle" },
    { t: "{A} und {B}: Wer länger nicht blinzelt, gewinnt. Verlierer trinkt.", type: "duell" },
    { t: "Alle, die schon mal im Club eingeschlafen sind, trinken.", type: "alle" },
    { t: "{A}, erzähl in einem Satz die peinlichste Geschichte mit {B}. Oder trink 3.", type: "normal" },
    { t: "Wasserpause 💧 Alle trinken einen Schluck Wasser. Ja, wirklich.", type: "alle" },
    { t: "{A}, du bist der Barkeeper: Hol oder öffne für {B} das nächste Getränk.", type: "normal" },
    { t: "Wer heute am meisten getrunken hat, darf 3 Schluck verteilen.", type: "alle" },
    { t: "{A} gegen {B}: Wer zuerst ein Bier-Emoji in die Gruppe schickt, gewinnt.", type: "duell" },
    { t: "{A}, wer hier wäre der beste Bürgermeister? Der verteilt 2.", type: "normal" },
    { t: "Alle, die heute im Gym waren, trinken. Die anderen auch, aus Solidarität.", type: "alle" },
    { t: "{A} und {B} tauschen für eine Runde den Platz.", type: "normal" },
    { t: "Reim-Runde: {A} sagt ein Wort, reihum reimen. Wer hängt, trinkt.", type: "normal" },
    { t: "Wer den weitesten Heimweg hat, trinkt 1 Schluck.", type: "alle" },
    { t: "{A}, stoß mit allen einzeln an.", type: "normal" },
    { t: "Daumen hoch! Der Letzte trinkt 2.", type: "alle" },
    { t: "{A}, sag jedem hier ein ehrliches Kompliment. Sonst 3 Schluck.", type: "normal" },
    { t: "{A} gegen {B}: Armdrücken! Verlierer trinkt 2.", type: "duell" },
    { t: "Alle, die ein Tattoo haben, trinken 1 Schluck.", type: "alle" },
    { t: "{A}, wähl einen Song. Wer den Interpreten nicht kennt, trinkt.", type: "normal" },
    { t: "Kategorie: Was man im Kasten findet, außer Bier. {A} beginnt.", type: "normal" },
    { t: "Wer heute als Erster heimgehen will, trinkt 2. Ehrlich sein!", type: "alle" },
  ];
  const RULES = [
    { start: "Regel: {A} darf nur noch mit links trinken. Erwischt = 2 Schluck.", end: "{A} darf wieder mit rechts trinken." },
    { start: "Regel: Niemand darf mehr „Bier“ sagen. Wer es sagt, trinkt.", end: "„Bier“ darf wieder gesagt werden. Endlich." },
    { start: "Regel: {A} ist Fragenmeister. Wer ihm eine Frage beantwortet, trinkt.", end: "{A} ist kein Fragenmeister mehr." },
    { start: "Regel: Vor jedem Schluck muss man „Prost Bergbauerbuam“ sagen.", end: "Die Prost-Regel ist aufgehoben." },
    { start: "Regel: {A} und {B} sind Trinkpartner. Trinkt einer, trinkt der andere mit.", end: "{A} und {B} sind keine Trinkpartner mehr." },
    { start: "Regel: Keine Vornamen mehr! Wer jemanden beim Namen nennt, trinkt.", end: "Vornamen sind wieder erlaubt." },
    { start: "Virus 🦠: {A} redet ab jetzt nur noch Hochdeutsch. Rückfall = 1 Schluck.", end: "{A} darf wieder bairisch reden. Gott sei Dank." },
  ];
  const TRUTH = [
    "Was war dein peinlichster Moment beim Feiern?", "Wer hier hat den schlechtesten Musikgeschmack?", "Was war die dümmste Ausrede, die du je benutzt hast?",
    "Wann hast du zuletzt geweint?", "Welche App würdest du nie jemandem zeigen?", "Wen hier würdest du auf eine einsame Insel mitnehmen?",
    "Was ist dein schlimmster Kater gewesen?", "Was war dein peinlichster Spitzname?", "Was hast du zuletzt gegoogelt?",
    "Wovor hast du heimlich Angst?", "Was würdest du mit 1 Million machen?", "Wer hier ist am ehesten ein Muttersöhnchen?",
    "Was ist das Teuerste, was du je verloren hast?", "Was war dein schlechtestes Date?", "Welche Lüge erzählst du am öftesten?",
    "Was nervt dich an der Person rechts von dir?", "Was war die schlimmste Note, die du je heimgebracht hast?", "Wann hast du dich zuletzt richtig blamiert?",
    "Welchen Promi findest du heimlich gut?", "Was ist dein Guilty-Pleasure-Song?", "Wem hast du zuletzt geschrieben?",
    "Was hast du als Kind angestellt, was deine Eltern bis heute nicht wissen?", "Was würdest du an dir ändern?", "Wer hier tanzt am schlechtesten?",
  ];
  const DARE = [
    "Mach 10 Liegestütze.", "Sing den Refrain deines Lieblingslieds.", "Lass die Gruppe eine Story auf deinem Insta posten.",
    "Ruf jemanden an und sing „Happy Birthday“.", "Red die nächsten 3 Runden mit Akzent.", "Mach deinen besten Schuhplattler.",
    "Lass dir von der Gruppe eine neue Frisur machen.", "Trink deinen nächsten Schluck ohne Hände.", "Lass jemanden ein Foto von dir machen, das in die Gruppe kommt.",
    "Imitiere ein Tier, bis jemand errät, welches.", "Erzähl einen Witz. Wenn keiner lacht, trinkst du.", "Mach 20 Sekunden lang den Moonwalk.",
    "Lies die letzte Nachricht in deinem Handy laut vor.", "Halte eine 30-Sekunden-Rede über Bier.", "Tausch ein Kleidungsstück mit dem linken Nachbarn.",
    "Mach ein Selfie mit dem hässlichsten Gesicht und schick es in die Gruppe.", "Sprich die nächste Runde nur in Reimen.", "Halt eine Minute lang die Planke.",
    "Lass die Person rechts von dir deine nächste Nachricht schreiben.", "Mach 15 Kniebeugen.", "Sag jedem hier, was du an ihm magst.",
    "Trommel 30 Sekunden einen Beat auf dem Tisch.", "Tanz 30 Sekunden ohne Musik.", "Lass dir einen Schnurrbart aufmalen.",
  ];
  const BOMB_TOPICS = [
    "Biermarken", "Fußballvereine", "Automarken", "Dinge im Kühlschrank", "Bayerische Städte", "Wörter mit B", "Tiere auf dem Bauernhof",
    "Schimpfwörter auf Bairisch", "Länder in Europa", "Rapper", "Dinge auf dem Oktoberfest", "Kartenspiele", "Supermärkte", "Berge",
    "Getränke", "Apps auf dem Handy", "Sportarten", "Gemüse", "Biersorten", "Was man im Club sieht",
  ];
  const IMPOSTER = [
    ["Bier", "Radler"], ["Weißwurst", "Leberkäs"], ["Club", "Bar"], ["Fußball", "Handball"], ["Oktoberfest", "Frühlingsfest"], ["Döner", "Pizza"],
    ["Berg", "Hügel"], ["Skifahren", "Snowboarden"], ["Tegernsee", "Chiemsee"], ["Traktor", "Mähdrescher"], ["Kuh", "Ziege"], ["Lederhose", "Jeans"],
    ["Brezn", "Semmel"], ["Kater", "Kopfweh"], ["Schafkopf", "Watten"], ["Grillen", "Kochen"], ["Bus", "Taxi"], ["Polizei", "Feuerwehr"],
    ["Hochzeit", "Geburtstag"], ["Kaffee", "Tee"], ["Netflix", "YouTube"], ["Instagram", "TikTok"], ["Mallorca", "Kroatien"], ["Gym", "Sauna"],
    ["Wein", "Sekt"], ["Shot", "Longdrink"], ["Auto", "Motorrad"], ["Stall", "Scheune"], ["Alm", "Hütte"], ["Maßkrug", "Weißbierglas"],
  ];
  const ESTIMATES = [
    ["Wie hoch ist die Zugspitze?", 2962, "m"], ["Wie hoch ist der Mount Everest?", 8849, "m"], ["Wie lang ist die Donau?", 2857, "km"],
    ["In welchem Jahr fand das erste Oktoberfest statt?", 1810, ""], ["In welchem Jahr wurde der FC Bayern gegründet?", 1900, ""], ["Wie viele Bundesländer hat Deutschland?", 16, ""],
    ["In welchem Jahr wurde das bayerische Reinheitsgebot erlassen?", 1516, ""], ["Wie viele Knochen hat ein erwachsener Mensch?", 206, ""], ["Wie hoch ist der Eiffelturm (mit Antenne)?", 330, "m"],
    ["Wie lang ist der Erdumfang am Äquator?", 40075, "km"], ["In welchem Jahr landeten Menschen zum ersten Mal auf dem Mond?", 1969, ""], ["Wie viele Tasten hat ein Klavier?", 88, ""],
    ["Mit wie vielen Karten spielt man Schafkopf?", 32, ""], ["Wie viele Länder sind in der EU?", 27, ""], ["Wie oft wurde Deutschland Fußball-Weltmeister (Männer)?", 4, ""],
    ["In welchem Jahr fiel die Berliner Mauer?", 1989, ""], ["Wie hoch ist der Olympiaturm in München?", 291, "m"], ["Wie viele Flaschen sind in einem Kasten Halbe?", 20, ""],
    ["Wie viele Felder hat ein Schachbrett?", 64, ""], ["Wie viele Minuten hat ein Tag?", 1440, ""], ["Wie viele Spieler stehen bei einer Fußballmannschaft auf dem Platz?", 11, ""],
    ["Wie groß ist der Bodensee?", 536, "km²"], ["Wie viele Herzen hat ein Oktopus?", 3, ""], ["In welchem Jahr wurde die Bundesrepublik gegründet?", 1949, ""],
  ];

  // ---------- Hilfen ----------
  const names = () => activePlayers().map((p) => p.name);
  function fill(t) {
    const ns = shuffle(names());
    const A = ns[0] || "Du", B = ns[1] || ns[0] || "dein Nachbar";
    return t.replaceAll("{A}", A).replaceAll("{B}", B);
  }
  function stopAll() {
    const g = S.g;
    if (g.timer) clearTimeout(g.timer);
    if (g.interval) clearInterval(g.interval);
    if (g.beep) clearTimeout(g.beep);
    g.timer = g.interval = g.beep = null;
  }
  let audio;
  function beep(freq = 880, dur = 0.06, vol = 0.15) {
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), v = audio.createGain();
      o.frequency.value = freq; v.gain.value = vol;
      o.connect(v); v.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch {}
  }
  const fmtNum = (n) => n.toLocaleString("de-DE");

  // ---------- Party-Modus (Picolo-Stil) ----------
  function partyDeck() {
    const deck = shuffle(PARTY).slice(0, 30).map((c) => ({ ...c, text: fill(c.t) }));
    shuffle(RULES).slice(0, 3).forEach((r) => {
      const ns = shuffle(names());
      const sub = (t) => t.replaceAll("{A}", ns[0] || "Du").replaceAll("{B}", ns[1] || ns[0] || "dein Nachbar");
      const at = Math.floor(Math.random() * (deck.length - 10));
      deck.splice(at, 0, { type: "regel", text: sub(r.start) });
      deck.splice(Math.min(deck.length, at + 6 + Math.floor(Math.random() * 4)), 0, { type: "ende", text: sub(r.end) });
    });
    return deck;
  }
  function viewParty() {
    const g = S.g;
    if (!g.deck) { g.deck = partyDeck(); g.i = -1; }
    const c = g.deck[g.i];
    const label = { normal: "", alle: "Alle", regel: "Neue Regel", ende: "Regel vorbei", duell: "Duell" }[c?.type] || "";
    if (g.i >= g.deck.length) return `<div class="card game-stage"><div class="prompt">Runde vorbei! 🍻</div><button class="btn gold block" data-act="game-reset">Nochmal</button></div>`;
    return `
      <div class="party-card ${c ? "t-" + c.type : "t-start"}" data-act="party-next">
        ${c ? `${label ? `<span class="party-label">${label}</span>` : ""}<div class="party-text">${esc(c.text)}</div>`
            : `<div class="party-text">Bergbauerbuam-Party 🎉</div><div class="muted">Mit euren Namen. Tipp auf die Karte für die nächste Aufgabe.</div>`}
        <span class="party-hint">Tippen für weiter · ${Math.max(0, g.i + 1)}/${g.deck.length}</span>
      </div>`;
  }

  // ---------- Party Roulette ----------
  function viewRoulette() {
    const g = S.g;
    const ps = activePlayers();
    return `
      <div class="roulette">${ps.map((p, i) => `<div class="r-slot ${g.hi === i ? "on" : ""}" style="--pc:${esc(p.color)}">${avatar(p, 52)}<b>${esc(p.name)}</b></div>`).join("")}</div>
      <div class="card game-stage">
        ${g.chosen != null && !g.spinning ? `
          <div class="rule"><b>${esc(ps[g.chosen]?.name)} ist dran!</b></div>
          ${g.card ? `<div class="prompt-pre">${g.card.k === "w" ? "Wahrheit" : "Pflicht"}</div><div class="prompt">${esc(g.card.t)}</div><div class="muted small" style="text-align:center">Kein Bock? Dann 3 Schluck.</div>` : `<div class="row"><button class="btn" data-act="rou-card" data-k="w">🤔 Wahrheit</button><button class="btn" data-act="rou-card" data-k="p">😈 Pflicht</button></div>`}
        ` : `<div class="rule"><span class="muted">${g.spinning ? "…" : "Wer ist dran?"}</span></div>`}
        <button class="btn gold block" data-act="rou-spin" ${g.spinning ? "disabled" : ""}>🎰 ${g.chosen != null ? "Nächste Runde" : "Drehen"}</button>
      </div>`;
  }
  function rouSpin() {
    const g = S.g, n = activePlayers().length;
    if (!n || g.spinning) return;
    g.spinning = true; g.card = null; g.chosen = null;
    const target = Math.floor(Math.random() * n);
    const steps = n * 3 + target + 1 - ((g.hi ?? -1) + 1);
    let k = 0, delay = 60;
    const step = () => {
      g.hi = ((g.hi ?? -1) + 1) % n; k++;
      beep(600 + (k % 2) * 200, 0.03, 0.08);
      render();
      if (k < steps) { delay *= k > steps - 6 ? 1.35 : 1.04; g.timer = setTimeout(step, delay); }
      else { g.spinning = false; g.chosen = g.hi; buzz(60); render(); }
    };
    step();
  }

  // ---------- Bombe ----------
  function viewBomb() {
    const g = S.g;
    g.state ||= "idle";
    if (g.state === "boom") return `<div class="bomb-boom" data-act="bomb-reset"><div class="bomb-e">💥</div><b>BOOM!</b><span>Wer das Handy hält, trinkt 3 Schluck.</span><span class="muted small">Tippen für neue Runde</span></div>`;
    return `
      <div class="card game-stage">
        <div class="prompt-pre">Thema</div>
        <div class="prompt" style="min-height:2.4em">${esc(g.topic || "Tipp auf Start")}</div>
        <div class="bomb ${g.state === "tick" ? "ticking" : ""}">💣</div>
        <div class="muted small" style="text-align:center">${g.state === "tick" ? "Sag einen Begriff zum Thema und gib das Handy weiter. Schnell!" : "Die Bombe geht irgendwann zwischen 15 und 50 Sekunden hoch. Niemand weiß, wann."}</div>
        ${g.state === "tick" ? `<button class="btn block" data-act="bomb-topic">Neues Thema</button>` : `<button class="btn gold block" data-act="bomb-start">💣 Start</button>`}
      </div>`;
  }
  function bombStart() {
    const g = S.g;
    stopAll();
    g.state = "tick"; g.topic = pick(BOMB_TOPICS);
    const total = 15000 + Math.random() * 35000, t0 = Date.now();
    const tickLoop = () => {
      const left = total - (Date.now() - t0);
      beep(left < 5000 ? 1200 : 900, 0.05, 0.12);
      g.beep = setTimeout(tickLoop, Math.max(120, Math.min(900, left / 12)));
    };
    tickLoop();
    g.timer = setTimeout(() => {
      stopAll(); g.state = "boom";
      beep(120, 0.6, 0.4); buzz(600);
      render();
    }, total);
    render();
  }

  // ---------- Duell (Reaktion & Tap-Battle) ----------
  function duelPlayers() {
    const ps = activePlayers();
    const g = S.g;
    g.pa ||= ps[0]?.id; g.pb ||= ps[1]?.id || ps[0]?.id;
    return [ps.find((p) => p.id === g.pa) || ps[0], ps.find((p) => p.id === g.pb) || ps[1] || ps[0]];
  }
  function viewDuel() {
    const g = S.g;
    g.mode ||= "reaktion"; g.score ||= [0, 0];
    const [a, b] = duelPlayers();
    if (g.arena) {
      const top = g.mode === "tap" ? `<b class="arena-n">${g.taps?.[0] || 0}</b>` : "";
      const bot = g.mode === "tap" ? `<b class="arena-n">${g.taps?.[1] || 0}</b>` : "";
      const msg = g.msg || "";
      const share = g.mode === "tap" ? ((g.taps[0] + 1) / (g.taps[0] + g.taps[1] + 2)) * 100 : 50;
      return `<div class="arena ${g.state || ""}" style="--split:${share}%">
        <div class="half top" data-side="0" style="--pc:${esc(a.color)}"><span class="arena-name">${esc(a.name)}</span>${top}<span class="arena-msg">${msg}</span></div>
        <div class="half bottom" data-side="1" style="--pc:${esc(b.color)}"><span class="arena-name">${esc(b.name)}</span>${bot}<span class="arena-msg">${msg}</span></div>
        <button class="arena-x" data-act="duel-exit" aria-label="Beenden">✕</button>
      </div>`;
    }
    const ps = activePlayers();
    return `
      <div class="seg"><button class="${g.mode === "reaktion" ? "on" : ""}" data-act="duel-mode" data-m="reaktion">⚡ Reaktion</button><button class="${g.mode === "tap" ? "on" : ""}" data-act="duel-mode" data-m="tap">👆 Tap-Battle</button></div>
      <div class="card section">
        <h3>Spieler 1 (oben)</h3>
        <div class="chips">${ps.map((p) => `<button class="chip ${g.pa === p.id ? "on" : ""}" style="--pc:${esc(p.color)}" data-act="duel-p" data-s="a" data-p="${p.id}">${avatar(p, 28)}${esc(p.name)}</button>`).join("")}</div>
        <h3>Spieler 2 (unten)</h3>
        <div class="chips">${ps.map((p) => `<button class="chip ${g.pb === p.id ? "on" : ""}" style="--pc:${esc(p.color)}" data-act="duel-p" data-s="b" data-p="${p.id}">${avatar(p, 28)}${esc(p.name)}</button>`).join("")}</div>
      </div>
      <div class="card game-stage">
        <div class="duel-score"><span>${esc(a.name)}</span><b class="num">${g.score[0]} : ${g.score[1]}</b><span>${esc(b.name)}</span></div>
        <div class="muted small" style="text-align:center">${g.mode === "reaktion" ? "Handy flach zwischen euch legen. Wenn es GRÜN wird, so schnell wie möglich auf deine Hälfte tippen. Zu früh getippt = verloren. Verlierer trinkt." : "10 Sekunden so oft wie möglich auf deine Hälfte tippen. Wer mehr schafft, gewinnt. Verlierer trinkt."}</div>
        <button class="btn gold block" data-act="duel-start">Los geht's</button>
      </div>`;
  }
  function duelStart() {
    const g = S.g;
    stopAll();
    g.arena = true; g.msg = ""; g.done = false;
    if (g.mode === "reaktion") {
      g.state = "wait"; g.msg = "Warten …";
      g.timer = setTimeout(() => { g.state = "go"; g.msg = "JETZT!"; g.goAt = performance.now(); beep(1000, 0.1, 0.2); render(); }, 1500 + Math.random() * 3500);
    } else {
      g.taps = [0, 0]; g.state = "count"; g.msg = "3";
      let n = 3;
      g.interval = setInterval(() => {
        n--;
        if (n > 0) { g.msg = String(n); beep(700); }
        else if (n === 0) { g.msg = "TIPPEN!"; g.state = "go"; beep(1100, 0.12); g.endAt = Date.now() + 10000; }
        else {
          const left = Math.ceil((g.endAt - Date.now()) / 1000);
          if (left <= 0) {
            clearInterval(g.interval); g.interval = null;
            const w = g.taps[0] === g.taps[1] ? -1 : g.taps[0] > g.taps[1] ? 0 : 1;
            finishDuel(w, w < 0 ? "Unentschieden! Beide trinken." : null);
            return;
          }
          g.msg = left + " s";
        }
        render();
      }, g.state === "go" ? 1000 : 800);
    }
    render();
  }
  function finishDuel(winner, text) {
    const g = S.g;
    const [a, b] = duelPlayers();
    if (winner >= 0) g.score[winner]++;
    g.state = "done"; g.done = true;
    g.msg = text || `${esc([a, b][winner].name)} gewinnt! ${esc([a, b][1 - winner].name)} trinkt.`;
    buzz(200);
    render();
    g.timer = setTimeout(() => { g.arena = false; g.state = null; render(); }, 2600);
  }
  function duelTap(side) {
    const g = S.g;
    if (!g.arena || g.done) return;
    if (g.mode === "reaktion") {
      if (g.state === "wait") { stopAll(); finishDuel(1 - side, `Zu früh! ${esc(duelPlayers()[side].name)} trinkt.`); }
      else if (g.state === "go") { const ms = Math.round(performance.now() - g.goAt); finishDuel(side, `${esc(duelPlayers()[side].name)} gewinnt in ${ms} ms! ${esc(duelPlayers()[1 - side].name)} trinkt.`); }
    } else if (g.state === "go") {
      g.taps[side]++;
      const el = document.querySelector(`.half[data-side="${side}"] .arena-n`);
      if (el) el.textContent = g.taps[side];
      const ar = document.querySelector(".arena");
      if (ar) ar.style.setProperty("--split", ((g.taps[0] + 1) / (g.taps[0] + g.taps[1] + 2)) * 100 + "%");
    }
  }
  function afterDuel() {
    document.querySelectorAll(".half").forEach((h) => {
      h.addEventListener("pointerdown", (e) => { e.preventDefault(); duelTap(+h.dataset.side); }, { passive: false });
    });
  }

  // ---------- Flaschendrehen ----------
  function viewBottle() {
    const g = S.g;
    const ps = activePlayers(), n = ps.length;
    g.rot ||= 0;
    const R = 42;
    return `
      <div class="card game-stage">
        <div class="bottle-ring">
          ${ps.map((p, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return `<div class="b-seat ${g.target === i && !g.spinning ? "on" : ""}" style="left:${50 + R * Math.cos(a)}%;top:${50 + R * Math.sin(a)}%">${avatar(p, 44)}<span>${esc(p.name)}</span></div>`; }).join("")}
          <div class="bottle" id="bottle" style="transform:translate(-50%,-50%) rotate(${g.rot}deg)">
            <svg viewBox="0 0 40 120" width="40" height="120" aria-hidden="true"><rect x="15" y="2" width="10" height="10" rx="2" fill="#c98a12"/><rect x="14" y="10" width="12" height="28" rx="3" fill="#3f8f5a"/><path d="M14 38 Q6 48 6 60 L6 112 Q6 118 12 118 L28 118 Q34 118 34 112 L34 60 Q34 48 26 38 Z" fill="#3f8f5a"/><rect x="9" y="66" width="22" height="26" rx="3" fill="#f4ecdc"/><rect x="12" y="74" width="16" height="3" fill="#c98a12"/><rect x="12" y="80" width="12" height="3" fill="#c98a12"/></svg>
          </div>
        </div>
        <div class="rule">${g.target != null && !g.spinning ? `<b>${esc(ps[g.target]?.name)}!</b><span class="muted">Wahrheit, Pflicht oder 2 Schluck.</span>` : `<span class="muted">${g.spinning ? "…" : "Dreh die Flasche"}</span>`}</div>
        <button class="btn gold block" data-act="bottle-spin" ${g.spinning ? "disabled" : ""}>🍾 Drehen</button>
      </div>`;
  }
  function bottleSpin() {
    const g = S.g, n = activePlayers().length;
    if (!n || g.spinning) return;
    const t = Math.floor(Math.random() * n);
    const want = (t / n) * 360;
    const base = g.rot - (g.rot % 360);
    g.rot = base + 360 * (4 + Math.floor(Math.random() * 3)) + want + (Math.random() - 0.5) * (300 / n);
    g.spinning = true; g.target = t;
    const el = $("#bottle");
    if (el) { el.style.transition = "transform 3.2s cubic-bezier(.17,.67,.21,1)"; el.style.transform = `translate(-50%,-50%) rotate(${g.rot}deg)`; }
    $("[data-act=bottle-spin]")?.setAttribute("disabled", "");
    g.timer = setTimeout(() => { g.spinning = false; buzz(60); render(); }, 3300);
  }

  // ---------- Imposter ----------
  function viewImposter() {
    const g = S.g;
    const ps = activePlayers();
    if (ps.length < 3) return `<div class="card"><div class="empty">Imposter braucht mindestens 3 Spieler.</div></div>`;
    if (!g.pair) {
      const pair = pick(IMPOSTER); const flip = Math.random() < 0.5;
      g.pair = flip ? [pair[1], pair[0]] : pair;
      g.order = shuffle(ps.map((p) => p.id)); g.imp = g.order[Math.floor(Math.random() * g.order.length)];
      g.i = 0; g.show = false; g.phase = "deal";
    }
    const pid = g.order[g.i];
    const p = ps.find((x) => x.id === pid);
    if (g.phase === "deal") {
      return `<div class="card game-stage imp">
        <div class="muted small" style="text-align:center">Spieler ${g.i + 1} von ${g.order.length}</div>
        ${g.show
          ? `<div class="prompt-pre">Dein Wort</div><div class="prompt">${esc(pid === g.imp ? g.pair[1] : g.pair[0])}</div><div class="muted small" style="text-align:center">Merk es dir und sag es niemandem.</div><button class="btn gold block" data-act="imp-next">Verstecken & weitergeben</button>`
          : `${avatar(p, 72)}<div class="rule"><b>Gib das Handy an ${esc(p.name)}</b><span class="muted">Nur ${esc(p.name)} darf schauen!</span></div><button class="btn gold block" data-act="imp-show">Ich bin ${esc(p.name)} – zeig mein Wort</button>`}
      </div>`;
    }
    if (g.phase === "talk") {
      const starter = ps.find((x) => x.id === g.order[Math.floor(Math.random() * 1)]);
      return `<div class="card game-stage">
        <div class="prompt">Diskussion! 🕵️</div>
        <div class="muted" style="text-align:center">Reihum sagt jeder ein Wort, das zu seinem Begriff passt, ohne ihn zu verraten. ${esc(starter?.name || "")} fängt an. Einer hat ein anderes Wort … Wer ist der Imposter?</div>
        <div class="muted small" style="text-align:center">Nach 2 Runden zeigen alle gleichzeitig auf den Verdächtigen.</div>
        <button class="btn gold block" data-act="imp-reveal">Auflösen</button>
      </div>`;
    }
    const imp = ps.find((x) => x.id === g.imp);
    return `<div class="card game-stage">
      ${avatar(imp, 72)}
      <div class="rule"><b>${esc(imp?.name)} war der Imposter!</b><span>Alle hatten „${esc(g.pair[0])}“, ${esc(imp?.name)} hatte „${esc(g.pair[1])}“.</span></div>
      <div class="muted small" style="text-align:center">Erwischt? Dann trinkt der Imposter 3. Sonst trinken alle anderen 2.</div>
      <button class="btn gold block" data-act="game-reset">Neue Runde</button>
    </div>`;
  }

  // ---------- Schätzfragen ----------
  function viewEstimate() {
    const g = S.g;
    if (!g.order) { g.order = shuffle(ESTIMATES); g.i = 0; g.reveal = false; }
    const [q, a, u] = g.order[g.i % g.order.length];
    return `<div class="card game-stage">
      <div class="prompt-pre">Schätzfrage ${(g.i % g.order.length) + 1}/${g.order.length}</div>
      <div class="prompt">${esc(q)}</div>
      <div class="muted small" style="text-align:center">Jeder sagt laut seine Schätzung. Wer am weitesten daneben liegt, trinkt 2. Der Nächste dran darf 2 verteilen.</div>
      ${g.reveal ? `<div class="rule"><span class="muted">Antwort</span><b class="answer">${fmtNum(a)}${u ? " " + u : ""}</b></div><button class="btn gold block" data-act="est-next">Nächste Frage</button>`
                 : `<button class="btn gold block" data-act="est-reveal">Antwort zeigen</button>`}
    </div>`;
  }

  // ---------- Registrierung ----------
  const games = [
    { id: "party", cat: "party", name: "Bergbauerbuam-Party", emoji: "🎉", desc: "Picolo-Style mit euren Namen, Regeln und Duellen.", view: viewParty },
    { id: "roulette", cat: "party", name: "Party Roulette", emoji: "🎰", desc: "Das Handy wählt jemanden: Wahrheit oder Pflicht.", view: viewRoulette },
    { id: "bombe", cat: "action", name: "Bombe", emoji: "💣", desc: "Begriff sagen, Handy weitergeben, bevor's knallt.", view: viewBomb },
    { id: "duell", cat: "action", name: "Duell", emoji: "⚡", desc: "Reaktionstest oder Tap-Battle zu zweit.", view: viewDuel, after: () => S.g.arena && afterDuel() },
    { id: "flasche", cat: "action", name: "Flaschendrehen", emoji: "🍾", desc: "Die Flasche zeigt, wer dran ist.", view: viewBottle },
    { id: "imposter", cat: "fragen", name: "Imposter", emoji: "🕵️", desc: "Einer hat ein anderes Wort. Findet ihn.", view: viewImposter },
    { id: "schaetzen", cat: "fragen", name: "Schätzfragen", emoji: "🎯", desc: "Wer am weitesten daneben liegt, trinkt.", view: viewEstimate },
  ];
  const actions = {
    "party-next": () => { const g = S.g; g.i++; buzz(); render(); },
    "rou-spin": rouSpin,
    "rou-card": (el) => { const k = el.dataset.k; S.g.card = { k, t: pick(k === "w" ? TRUTH : DARE) }; render(); },
    "bomb-start": bombStart,
    "bomb-topic": () => { S.g.topic = pick(BOMB_TOPICS.filter((t) => t !== S.g.topic)); render(); },
    "bomb-reset": () => { stopAll(); S.g = { state: "idle" }; render(); },
    "duel-mode": (el) => { S.g.mode = el.dataset.m; S.g.score = [0, 0]; render(); },
    "duel-p": (el) => { S.g[el.dataset.s === "a" ? "pa" : "pb"] = el.dataset.p; S.g.score = [0, 0]; render(); },
    "duel-start": duelStart,
    "duel-exit": () => { stopAll(); S.g.arena = false; S.g.state = null; render(); },
    "bottle-spin": bottleSpin,
    "imp-show": () => { S.g.show = true; render(); },
    "imp-next": () => { const g = S.g; g.show = false; g.i++; if (g.i >= g.order.length) g.phase = "talk"; render(); },
    "imp-reveal": () => { S.g.phase = "reveal"; buzz(100); render(); },
    "est-reveal": () => { S.g.reveal = true; buzz(); render(); },
    "est-next": () => { S.g.i++; S.g.reveal = false; render(); },
  };
  return { games, actions, stop: stopAll };
};

import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBgrOaxcAQDEZsklVtPVHzFZxkTK2SGfMI",
  authDomain: "masters-2026-4828a.firebaseapp.com",
  projectId: "masters-2026-4828a",
  storageBucket: "masters-2026-4828a.firebasestorage.app",
  messagingSenderId: "253698157120",
  appId: "1:253698157120:web:a099653d1adad8c7170da5",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const STATE_DOC = doc(db, "game", "state");

const DEFAULT_NAMES = ["Fred", "Wife"];

const FULL_FIELD = [
  "Scottie Scheffler","Rory McIlroy","Jon Rahm","Xander Schauffele","Brooks Koepka",
  "Collin Morikawa","Viktor Hovland","Patrick Cantlay","Bryson DeChambeau","Justin Thomas",
  "Jordan Spieth","Tony Finau","Tommy Fleetwood","Shane Lowry","Ludvig Åberg",
  "Cameron Smith","Min Woo Lee","Hideki Matsuyama","Will Zalatoris","Corey Conners",
  "Joaquin Niemann","Jason Day","Keegan Bradley","Russell Henley","Sungjae Im",
  "Adam Scott","Harris English","Chris Kirk","Denny McCarthy","Taylor Moore",
  "Sahith Theegala","Si Woo Kim","Tom Kim","Jake Knapp","Seamus Power",
  "Thomas Detry","Lucas Glover","Cameron Young","Dustin Johnson","Matt Fitzpatrick",
  "Max Homa","Billy Horschel","Fred Couples","Bernhard Langer","Larry Mize",
  "Jose Maria Olazabal","Vijay Singh","Mike Weir","Trevor Immelman",
  "Zach Johnson","Charl Schwartzel","Bubba Watson","Danny Willett","Patrick Reed",
  "Sergio Garcia","Ian Poulter","Lee Westwood","Louis Oosthuizen",
  "Marc Leishman","Kevin Kisner","Christiaan Bezuidenhout","Taylor Pendrith","Nick Dunlap",
  "Neal Shipley","Austin Eckroat","Akshay Bhatia","Nicolai Højgaard","Robert MacIntyre",
  "Brian Harman","Tyrrell Hatton","Erik van Rooyen",
  "Mackenzie Hughes","Kevin Yu","JT Poston","Davis Thompson","Ben Griffin"
].filter((v, i, a) => a.indexOf(v) === i);

const SCORE_TABLE = { 1: 5, 2: 3, 3: 2 };
function getPoints(position) {
  if (!position || position > 10) return 0;
  return SCORE_TABLE[position] || 1;
}

const DAYS = [
  {
    day: "Thursday", round: 1, lockHour: 15,
    bets: [
      { id: "thu1", label: "Round 1 Low Score — Pick 5 Players", prize: "🍽️ Picks Friday dinner location", type: "pick5" },
      { id: "thu2", label: "How low will the Round 1 leader shoot? (closest without going over wins)", prize: "🎾 Picks Saturday activity", type: "guess_score" },
    ],
  },
  {
    day: "Friday", round: 2, lockHour: 15,
    bets: [
      { id: "fri1", label: "Round 2 Low Score — Pick 5 Players", prize: "🍽️ Picks Saturday dinner location", type: "pick5" },
      { id: "fri2", label: "More than 65 players make the cut?", prize: "☀️ Picks Sunday show/movie", type: "yesno" },
    ],
  },
  {
    day: "Saturday", round: 3, lockHour: 14,
    bets: [
      { id: "sat1", label: "Round 3 Low Score — Pick 5 Players", prize: "🧺 Does laundry", type: "pick5" },
      { id: "sat2", label: "54-hole leader shoots 66 or better Saturday?", prize: "🍳 Makes Sunday dinner", type: "yesno" },
    ],
  },
  {
    day: "Sunday", round: 4, lockHour: 14,
    bets: [
      { id: "sun1", label: "Pick the Masters Champion", prize: "💰 $100 to spend on anything", type: "pick_winner" },
      { id: "sun2", label: "Will there be a playoff?", prize: "🎁 Bonus $50 or custom prize", type: "yesno" },
    ],
  },
];

const ET_OFFSET = -4;
function getETInfo() {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  const et = new Date(utc + ET_OFFSET * 3600000);
  return { hour: et.getHours(), dow: et.getDay() };
}
function getDayIndex() {
  const { dow } = getETInfo();
  return { 4: 0, 5: 1, 6: 2, 0: 3 }[dow] ?? 0;
}
function isMastersWeekend() {
  return [0, 4, 5, 6].includes(getETInfo().dow);
}
function isLocked(dIdx) {
  if (!isMastersWeekend()) return false;
  const cur = getDayIndex();
  if (dIdx < cur) return true;
  if (dIdx > cur) return false;
  return getETInfo().hour >= DAYS[dIdx].lockHour;
}

function scorePick5(playerPicks, roundResults) {
  if (!roundResults || !playerPicks?.length) return null;
  return playerPicks.reduce((sum, p) => sum + getPoints(roundResults[p] ?? 99), 0);
}

const DEFAULT_STATE = {
  names: DEFAULT_NAMES,
  picks: { [DEFAULT_NAMES[0]]: {}, [DEFAULT_NAMES[1]]: {} },
  results: {},
};

export default function App() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [leaderboard, setLeaderboard] = useState(null);
  const [loadingLB, setLoadingLB] = useState(false);
  const [activeDay, setActiveDay] = useState(Math.max(getDayIndex(), 0));
  const [tab, setTab] = useState("bets");
  const [editNames, setEditNames] = useState(false);
  const [playerSearch, setPlayerSearch] = useState({});
  const [syncing, setSyncing] = useState(false);

  const { names, picks, results } = state;

  // ── Firebase real-time listener ───────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(STATE_DOC, snap => {
      if (snap.exists()) setState(snap.data());
    });
    return unsub;
  }, []);

  // ── Save to Firebase ──────────────────────────────────────────────────────
  async function saveState(newState) {
    setSyncing(true);
    try {
      await setDoc(STATE_DOC, newState);
    } finally {
      setSyncing(false);
    }
  }

  function updateState(patch) {
    const newState = { ...state, ...patch };
    setState(newState);
    saveState(newState);
  }

  // ── Sync picks keys when names change ────────────────────────────────────
  useEffect(() => {
    const newPicks = {};
    names.forEach(n => { newPicks[n] = picks[n] || {}; });
    if (JSON.stringify(newPicks) !== JSON.stringify(picks)) {
      updateState({ picks: newPicks });
    }
  }, [names]);

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const fetchLB = useCallback(() => {
    setLoadingLB(true);
    fetch("https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard")
      .then(r => r.json())
      .then(data => {
        const masters = (data?.events || []).find(e => e.name?.toLowerCase().includes("masters")) || data?.events?.[0];
        if (!masters) { setLeaderboard(null); return; }
        const comps = masters.competitions?.[0]?.competitors || [];
        setLeaderboard(comps.map(c => ({
          name: c.athlete?.displayName || "Unknown",
          toPar: c.statistics?.find(s => s.name === "scoreToPar")?.displayValue || c.score || "E",
          position: parseInt(c.status?.position?.id) || 99,
        })).sort((a, b) => a.position - b.position));
      })
      .catch(() => setLeaderboard(null))
      .finally(() => setLoadingLB(false));
  }, []);

  useEffect(() => { fetchLB(); }, [fetchLB]);

  // ── Pick helpers ──────────────────────────────────────────────────────────
  function togglePick5(name, betId, player) {
    const cur = picks[name]?.[betId] || [];
    const next = cur.includes(player) ? cur.filter(p => p !== player) : cur.length < 5 ? [...cur, player] : cur;
    updateState({ picks: { ...picks, [name]: { ...picks[name], [betId]: next } } });
  }
  function setSinglePick(name, betId, val) {
    updateState({ picks: { ...picks, [name]: { ...picks[name], [betId]: val } } });
  }
  function markWinner(betId, winner) {
    updateState({ results: { ...results, [betId]: { ...(results[betId] || {}), winner } } });
  }
  function setRoundResult(betId, player, pos) {
    const rr = { ...(results[betId]?.roundResults || {}), [player]: pos === "" ? undefined : parseInt(pos) };
    updateState({ results: { ...results, [betId]: { ...(results[betId] || {}), roundResults: rr } } });
  }

  // ── Trophies ──────────────────────────────────────────────────────────────
  function getTrophies() {
    const t = { [names[0]]: [], [names[1]]: [], draw: [] };
    DAYS.forEach(d => d.bets.forEach(b => {
      const w = results[b.id]?.winner;
      if (w === "draw") t.draw.push({ prize: b.prize, day: d.day });
      else if (w && t[w]) t[w].push({ prize: b.prize, day: d.day });
    }));
    return t;
  }
  const trophies = getTrophies();
  const field = (leaderboard && leaderboard.length > 0) ? leaderboard.map(p => p.name) : FULL_FIELD;

  const btnBase = { border: "none", cursor: "pointer", fontFamily: "Georgia, serif" };
  const card = { background: "#0d2b0d", border: "1px solid #2d5a2d", borderRadius: 12, padding: 16, marginBottom: 14 };

  return (
    <div style={{ fontFamily: "Georgia, serif", background: "#1a3a1a", minHeight: "100vh", color: "#f5f0e8", paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0d2b0d,#1e5c1e)", padding: "20px 16px 14px", textAlign: "center", borderBottom: "3px solid #c8a951" }}>
        <div style={{ fontSize: 26, fontWeight: "bold", color: "#c8a951", letterSpacing: 1 }}>⛳ The Masters 2026</div>
        <div style={{ fontSize: 12, color: "#a8c8a8", marginTop: 3 }}>Weekend Betting Game</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          {names.map((n, i) => (
            <div key={i} style={{ background: "#0d2b0d", border: "1px solid #c8a951", borderRadius: 20, padding: "4px 14px", fontSize: 13, color: "#c8a951" }}>
              {i === 0 ? "🏌️" : "🏌️‍♀️"} {n}
            </div>
          ))}
          <button onClick={() => setEditNames(v => !v)} style={{ ...btnBase, background: "transparent", border: "1px solid #555", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#aaa" }}>✏️</button>
          {syncing && <span style={{ fontSize: 11, color: "#8aaa8a", alignSelf: "center" }}>⏳ saving...</span>}
        </div>
        {editNames && (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
            {[0, 1].map(i => (
              <input key={i} value={names[i]}
                onChange={e => { const n = [...names]; n[i] = e.target.value; updateState({ names: n }); }}
                style={{ background: "#0d2b0d", border: "1px solid #c8a951", borderRadius: 8, padding: "4px 10px", color: "#f5f0e8", fontSize: 13, width: 100, textAlign: "center" }} />
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#0d2b0d", borderBottom: "2px solid #2d5a2d" }}>
        {[["bets","📋 Bets"],["leaderboard","📊 Board"],["trophies","🏆 Prizes"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...btnBase, flex: 1, padding: "11px 4px", background: tab === t ? "#1e5c1e" : "transparent", color: tab === t ? "#c8a951" : "#8aaa8a", fontSize: 12, borderBottom: tab === t ? "2px solid #c8a951" : "none" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 12px", maxWidth: 620, margin: "0 auto" }}>

        {/* ── BETS TAB ── */}
        {tab === "bets" && (<>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
            {DAYS.map((d, i) => (
              <button key={i} onClick={() => setActiveDay(i)}
                style={{ ...btnBase, flex: "0 0 auto", padding: "7px 14px", borderRadius: 20, border: activeDay === i ? "2px solid #c8a951" : "1px solid #2d5a2d", background: activeDay === i ? "#1e5c1e" : "#0d2b0d", color: activeDay === i ? "#c8a951" : "#8aaa8a", fontSize: 12 }}>
                {d.day} {isLocked(i) && i <= getDayIndex() ? "🔒" : ""}
              </button>
            ))}
          </div>

          {DAYS[activeDay].bets.map(bet => {
            const locked = isLocked(activeDay);
            const betResult = results[bet.id] || {};
            const winner = betResult.winner;
            const roundResults = betResult.roundResults || {};
            const search = playerSearch[bet.id] || "";

            return (
              <div key={bet.id} style={card}>
                <div style={{ fontSize: 14, fontWeight: "bold", color: "#e8d5a0", marginBottom: 4 }}>{bet.label}</div>
                <div style={{ fontSize: 12, color: "#c8a951", marginBottom: 14 }}>🏆 Prize: {bet.prize}</div>

                {/* ── PICK 5 ── */}
                {bet.type === "pick5" && (<>
                  <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                    {[["🥇 1st","5pts"],["🥈 2nd","3pts"],["🥉 3rd","2pts"],["Top 10","1pt"],["Outside","0pts"]].map(([l,v]) => (
                      <div key={l} style={{ background: "#122b12", borderRadius: 6, padding: "3px 8px", fontSize: 10, color: "#a8c8a8" }}>{l} = <span style={{ color: "#c8a951" }}>{v}</span></div>
                    ))}
                  </div>
                  <input placeholder="🔍 Search players..." value={search}
                    onChange={e => setPlayerSearch(prev => ({ ...prev, [bet.id]: e.target.value }))}
                    style={{ width: "100%", background: "#122b12", border: "1px solid #2d5a2d", borderRadius: 8, padding: "6px 10px", color: "#f5f0e8", fontSize: 12, marginBottom: 10, boxSizing: "border-box" }} />
                  {names.map((name, ni) => {
                    const chosen = picks[name]?.[bet.id] || [];
                    const pts = scorePick5(chosen, roundResults);
                    return (
                      <div key={ni} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 12, color: "#8aaa8a", marginBottom: 6 }}>
                          {ni === 0 ? "🏌️" : "🏌️‍♀️"} <strong style={{ color: "#e8d5a0" }}>{name}</strong>
                          — {chosen.length}/5 picked
                          {pts !== null && <span style={{ color: "#c8a951", marginLeft: 8 }}>● {pts} pts</span>}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                          {chosen.map(p => {
                            const pos = roundResults[p];
                            const ptVal = pos !== undefined ? getPoints(pos) : null;
                            return (
                              <div key={p} style={{ background: "#1e5c1e", border: "1px solid #c8a951", borderRadius: 20, padding: "3px 10px", fontSize: 11, color: "#c8a951", display: "flex", alignItems: "center", gap: 4 }}>
                                {p.split(" ").slice(-1)[0]}
                                {ptVal !== null && <span style={{ color: "#e8d5a0" }}>({ptVal}pt)</span>}
                                {!locked && <span onClick={() => togglePick5(name, bet.id, p)} style={{ cursor: "pointer", color: "#c66", marginLeft: 2 }}>✕</span>}
                              </div>
                            );
                          })}
                        </div>
                        {!locked && (
                          <div style={{ maxHeight: 140, overflowY: "auto", background: "#122b12", borderRadius: 8, padding: "6px 8px" }}>
                            {field.filter(p => p.toLowerCase().includes(search.toLowerCase()) && !chosen.includes(p)).map(p => (
                              <div key={p} onClick={() => togglePick5(name, bet.id, p)}
                                style={{ padding: "5px 6px", borderRadius: 6, cursor: chosen.length >= 5 ? "not-allowed" : "pointer", fontSize: 12, color: chosen.length >= 5 ? "#555" : "#c8e8c8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>{p}</span>
                                {leaderboard && (() => { const lb = leaderboard.find(x => x.name === p); return lb ? <span style={{ fontSize: 10, color: "#8aaa8a" }}>T{lb.position} {lb.toPar}</span> : null; })()}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11, color: "#666", cursor: "pointer" }}>📝 Enter round positions (admin)</summary>
                    <div style={{ marginTop: 8 }}>
                      {[...new Set([...names.flatMap(n => picks[n]?.[bet.id] || [])])].map(p => (
                        <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{ flex: 1, fontSize: 12, color: "#c8e8c8" }}>{p}</div>
                          <input type="number" min="1" max="90" placeholder="pos" value={roundResults[p] || ""}
                            onChange={e => setRoundResult(bet.id, p, e.target.value)}
                            style={{ width: 60, background: "#122b12", border: "1px solid #2d5a2d", borderRadius: 6, padding: "4px 6px", color: "#f5f0e8", fontSize: 12, textAlign: "center" }} />
                          <span style={{ fontSize: 11, color: "#c8a951" }}>{roundResults[p] ? getPoints(roundResults[p]) + "pt" : ""}</span>
                        </div>
                      ))}
                      {(() => {
                        const s0 = scorePick5(picks[names[0]]?.[bet.id] || [], roundResults);
                        const s1 = scorePick5(picks[names[1]]?.[bet.id] || [], roundResults);
                        if (s0 === null || s1 === null) return null;
                        const auto = s0 > s1 ? names[0] : s1 > s0 ? names[1] : "draw";
                        return (
                          <div style={{ marginTop: 8, background: "#1a3a1a", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                            <span style={{ color: "#8aaa8a" }}>Score: </span>
                            <span style={{ color: "#c8a951" }}>{names[0]}: {s0}pts</span>
                            <span style={{ color: "#666", margin: "0 6px" }}>vs</span>
                            <span style={{ color: "#c8a951" }}>{names[1]}: {s1}pts</span>
                            <button onClick={() => markWinner(bet.id, auto)}
                              style={{ ...btnBase, display: "block", marginTop: 8, width: "100%", background: "#1e5c1e", border: "1px solid #c8a951", borderRadius: 8, padding: "6px", color: "#c8a951", fontSize: 12 }}>
                              ✅ Set winner: {auto === "draw" ? "🤝 Draw" : auto}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </details>
                </>)}

                {/* ── GUESS SCORE ── */}
                {bet.type === "guess_score" && (<>
                  <div style={{ fontSize: 11, color: "#8aaa8a", marginBottom: 10 }}>Enter strokes under par (e.g. 7 = -7). Closest without going over wins.</div>
                  {names.map((name, ni) => (
                    <div key={ni} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "#8aaa8a", marginBottom: 5 }}>{ni === 0 ? "🏌️" : "🏌️‍♀️"} {name}:</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: "#c8a951", fontSize: 14 }}>-</span>
                        <input type="number" min="1" max="30" disabled={locked}
                          value={picks[name]?.[bet.id] || ""}
                          onChange={e => setSinglePick(name, bet.id, e.target.value)}
                          placeholder="e.g. 7"
                          style={{ width: 80, background: "#1a3a1a", border: "1px solid #2d5a2d", borderRadius: 8, padding: "7px 10px", color: "#f5f0e8", fontSize: 14, textAlign: "center" }} />
                        <span style={{ color: "#8aaa8a", fontSize: 12 }}>under par</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #2d5a2d", marginTop: 8, paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>📝 Actual leader score (admin):</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ color: "#c8a951" }}>-</span>
                      <input type="number" min="1" max="30"
                        value={results[bet.id]?.actualScore || ""}
                        onChange={e => updateState({ results: { ...results, [bet.id]: { ...(results[bet.id] || {}), actualScore: parseInt(e.target.value) || "" } } })}
                        style={{ width: 70, background: "#122b12", border: "1px solid #2d5a2d", borderRadius: 8, padding: "5px 8px", color: "#f5f0e8", fontSize: 13, textAlign: "center" }} />
                      <span style={{ color: "#8aaa8a", fontSize: 12 }}>under par</span>
                    </div>
                    {(() => {
                      const actual = results[bet.id]?.actualScore;
                      if (!actual) return null;
                      const g0 = parseInt(picks[names[0]]?.[bet.id]);
                      const g1 = parseInt(picks[names[1]]?.[bet.id]);
                      const valid0 = g0 && g0 <= actual;
                      const valid1 = g1 && g1 <= actual;
                      const diff0 = valid0 ? actual - g0 : Infinity;
                      const diff1 = valid1 ? actual - g1 : Infinity;
                      let auto;
                      if (!valid0 && !valid1) auto = null;
                      else if (!valid1) auto = names[0];
                      else if (!valid0) auto = names[1];
                      else if (diff0 < diff1) auto = names[0];
                      else if (diff1 < diff0) auto = names[1];
                      else auto = "draw";
                      return (
                        <div style={{ background: "#1a3a1a", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                          {[names[0], names[1]].map((n, i) => {
                            const g = i === 0 ? g0 : g1;
                            const v = i === 0 ? valid0 : valid1;
                            const d = i === 0 ? diff0 : diff1;
                            return <div key={n} style={{ color: "#a8c8a8", marginBottom: 3 }}>{n}: guessed -{g || "?"} → {v ? `off by ${d}` : <span style={{ color: "#cc6666" }}>over ✗</span>}</div>;
                          })}
                          {auto && <button onClick={() => markWinner(bet.id, auto)} style={{ ...btnBase, marginTop: 6, width: "100%", background: "#1e5c1e", border: "1px solid #c8a951", borderRadius: 8, padding: "6px", color: "#c8a951", fontSize: 12 }}>✅ Set winner: {auto === "draw" ? "🤝 Draw" : auto}</button>}
                          {!auto && <div style={{ color: "#cc6666", marginTop: 4 }}>Both guessed over — no winner!</div>}
                        </div>
                      );
                    })()}
                  </div>
                </>)}

                {/* ── YES/NO or PICK WINNER ── */}
                {(bet.type === "yesno" || bet.type === "pick_winner") && (<>
                  {names.map((name, ni) => (
                    <div key={ni} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: "#8aaa8a", marginBottom: 5 }}>{ni === 0 ? "🏌️" : "🏌️‍♀️"} {name}:</div>
                      {bet.type === "yesno" && (
                        <div style={{ display: "flex", gap: 8 }}>
                          {["Yes", "No"].map(opt => (
                            <button key={opt} onClick={() => !locked && setSinglePick(name, bet.id, opt)}
                              style={{ ...btnBase, flex: 1, padding: "7px", borderRadius: 8, border: picks[name]?.[bet.id] === opt ? "2px solid #c8a951" : "1px solid #2d5a2d", background: picks[name]?.[bet.id] === opt ? "#1e5c1e" : "#1a3a1a", color: picks[name]?.[bet.id] === opt ? "#c8a951" : "#a8c8a8", fontSize: 12, opacity: locked ? 0.7 : 1 }}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                      {bet.type === "pick_winner" && (
                        <select value={picks[name]?.[bet.id] || ""} onChange={e => !locked && setSinglePick(name, bet.id, e.target.value)} disabled={locked}
                          style={{ background: "#1a3a1a", border: "1px solid #2d5a2d", borderRadius: 8, color: "#f5f0e8", padding: "6px 10px", fontSize: 12, width: "100%" }}>
                          <option value="">-- pick a player --</option>
                          {field.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #2d5a2d", marginTop: 8, paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>📝 Mark result:</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[...names, "draw"].map(n => (
                        <button key={n} onClick={() => markWinner(bet.id, winner === n ? null : n)}
                          style={{ ...btnBase, flex: 1, padding: "6px 4px", borderRadius: 8, border: winner === n ? "2px solid #c8a951" : "1px solid #2d5a2d", background: winner === n ? "#1e5c1e" : "#1a3a1a", color: winner === n ? "#c8a951" : "#8aaa8a", fontSize: 11 }}>
                          {winner === n ? "✅" : "○"} {n === "draw" ? "🤝 Draw" : n}
                        </button>
                      ))}
                    </div>
                  </div>
                </>)}

                {winner && (
                  <div style={{ marginTop: 12, background: "#1e5c1e", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#c8a951", textAlign: "center" }}>
                    {winner === "draw" ? "🤝 Draw — both claim the prize!" : `🏆 ${winner} wins — ${bet.prize}`}
                  </div>
                )}
              </div>
            );
          })}
        </>)}

        {/* ── LEADERBOARD TAB ── */}
        {tab === "leaderboard" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 15, color: "#c8a951", fontWeight: "bold" }}>Live Masters Leaderboard</div>
              <button onClick={fetchLB} style={{ ...btnBase, background: "#1e5c1e", border: "1px solid #c8a951", borderRadius: 20, padding: "4px 12px", color: "#c8a951", fontSize: 11 }}>
                {loadingLB ? "⏳" : "🔄 Refresh"}
              </button>
            </div>
            {loadingLB && <div style={{ textAlign: "center", color: "#8aaa8a", padding: 40 }}>Loading...</div>}
            {!loadingLB && !leaderboard && (
              <div style={{ textAlign: "center", color: "#8aaa8a", padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⛳</div>
                <div>Live data unavailable — check back Thursday!</div>
              </div>
            )}
            {!loadingLB && leaderboard?.map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: i % 2 === 0 ? "#0d2b0d" : "#122b12", borderRadius: 8, marginBottom: 3 }}>
                <div style={{ width: 24, textAlign: "center", color: "#c8a951", fontSize: 13, fontWeight: "bold" }}>{p.position}</div>
                <div style={{ flex: 1, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: String(p.toPar).startsWith("-") ? "#6aaa6a" : p.toPar === "E" ? "#aaa" : "#cc6666", fontWeight: "bold" }}>{p.toPar}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── TROPHIES TAB ── */}
        {tab === "trophies" && (
          <div>
            <div style={{ fontSize: 15, color: "#c8a951", fontWeight: "bold", marginBottom: 14 }}>Prize Board</div>
            {names.map((name, ni) => (
              <div key={ni} style={card}>
                <div style={{ fontSize: 15, color: "#c8a951", marginBottom: 8 }}>{ni === 0 ? "🏌️" : "🏌️‍♀️"} {name}</div>
                {trophies[name].length === 0
                  ? <div style={{ fontSize: 12, color: "#666" }}>No prizes yet!</div>
                  : trophies[name].map((t, i) => (
                    <div key={i} style={{ background: "#1e5c1e", borderRadius: 8, padding: "7px 12px", marginBottom: 6, fontSize: 13, color: "#e8d5a0" }}>
                      🏆 {t.prize} <span style={{ fontSize: 11, color: "#8aaa8a" }}>({t.day})</span>
                    </div>
                  ))
                }
              </div>
            ))}
            {trophies.draw.length > 0 && (
              <div style={card}>
                <div style={{ fontSize: 15, color: "#c8a951", marginBottom: 8 }}>🤝 Shared Prizes</div>
                {trophies.draw.map((t, i) => (
                  <div key={i} style={{ background: "#1a3a2a", borderRadius: 8, padding: "7px 12px", marginBottom: 6, fontSize: 13, color: "#e8d5a0" }}>
                    🤝 {t.prize} <span style={{ fontSize: 11, color: "#8aaa8a" }}>({t.day})</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ ...card, border: "1px solid #c8a951", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: "#8aaa8a", marginBottom: 8 }}>Total prizes claimed</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 30 }}>
                {names.map((name, ni) => (
                  <div key={ni}>
                    <div style={{ fontSize: 30, color: "#c8a951", fontWeight: "bold" }}>{trophies[name].length}</div>
                    <div style={{ fontSize: 12, color: "#8aaa8a" }}>{name}</div>
                  </div>
                ))}
                {trophies.draw.length > 0 && (
                  <div>
                    <div style={{ fontSize: 30, color: "#6aaa6a", fontWeight: "bold" }}>{trophies.draw.length}</div>
                    <div style={{ fontSize: 12, color: "#8aaa8a" }}>Shared</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

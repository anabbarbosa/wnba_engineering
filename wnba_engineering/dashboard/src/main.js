import "./style.css";
import * as d3 from "d3";
import { loadData } from "./data.js";
import { raceChart, barList, scatter, gameColumns, teamInk, onColor, tipRows, fmtDate, parseDate } from "./charts.js";

const app = document.getElementById("app");
const seasonSelect = document.getElementById("season");
const f1 = d3.format(".1f"), pct = d3.format(".1%"), pct0 = d3.format(".0%"), int = d3.format(",d");
const signed = (v) => (v > 0 ? `+${f1(v)}` : f1(v));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dash = (v, f) => (v == null || Number.isNaN(v) ? "—" : f(v));

let D;                          // all data
let season;                     // selected season
const pinned = new Set();       // teams highlighted on the league page
let charts = [];                // live charts to tear down on navigation

const teamVars = (t) => `--c:${t.color};--c2:${t.alternate_color}`;
const teamByAbbr = (abbr) => [...D.teams.values()].find((t) => t.abbreviation.toLowerCase() === String(abbr).toLowerCase());
const standings = (s) => D.teamSeasons.filter((r) => r.season === s)
  .sort((a, b) => b.win_pct - a.win_pct || b.diff_per_game - a.diff_per_game);
const sectionHead = (num, title, dek = "") =>
  `<header class="section-head"><span class="num">${num}</span><h2>${title}</h2>${dek ? `<p>${dek}</p>` : ""}</header>`;

// ── boot (called at the bottom of the file, once every module-level const exists) ──
async function boot() {
 try {
  D = await loadData();
  season = D.seasons[0];
  seasonSelect.innerHTML = D.seasons.map((s) => `<option>${s}</option>`).join("");
  seasonSelect.addEventListener("change", () => { season = Number(seasonSelect.value); pinned.clear(); route(); });
  if (D.meta.exported_at) {
    document.querySelector("[data-updated]").textContent =
      `Data as of ${d3.utcFormat("%b %-d, %Y")(new Date(D.meta.exported_at))}`;
  }
  window.addEventListener("hashchange", route);
  route();
} catch (err) {
  app.innerHTML = `<p class="error">No data on the court.</p><p>${esc(err.message)}</p>
    <p>From <code>wnba_engineering/dashboard</code> run <code>npm run data</code> (Postgres must be up), then reload.</p>`;
  console.error(err);
 }
}

function route() {
  charts.forEach((c) => c.destroy());
  charts = [];
  const [, section = "", id] = location.hash.replace(/^#/, "").split("/");
  document.querySelectorAll("[data-season]").forEach((el) => (el.textContent = season));
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (a.dataset.nav === (section || "home")) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  ticker();
  if (section === "teams") teamPage(id);
  else if (section === "players" && id) playerPage(Number(id));
  else if (section === "players") playersPage();
  else leaguePage();
  window.scrollTo({ top: 0 });
}

// ── ticker ───────────────────────────────────────────────
function ticker() {
  const st = standings(season);
  const ps = D.playerSeasons.filter((r) => r.season === season && r.games >= 10);
  const top = d3.greatest(ps, (r) => r.ppg);
  const big = d3.greatest(D.playerGames.filter((r) => r.season === season), (r) => r.points);
  const reg = D.teamGames.filter((r) => r.season === season && r.season_type === "Regular Season");
  const items = [
    st[0] && `${st[0].team_name} lead at ${st[0].wins}–${st[0].losses}`,
    top && `${top.player_name} ${f1(top.ppg)} PPG`,
    big && `Season high: ${big.player_name} ${big.points} pts vs ${big.opponent}`,
    `${int(new Set(reg.map((r) => r.game_id)).size)} regular-season games`,
    `${f1(d3.mean(reg, (r) => r.points_for))} points per team per game`,
    st.length && `Best diff: ${d3.greatest(st, (r) => r.diff_per_game).team} ${signed(d3.max(st, (r) => r.diff_per_game))}`,
  ].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join("");
  document.getElementById("ticker").innerHTML = items + items;
}

// ── 01 · league ──────────────────────────────────────────
function leaguePage() {
  const st = standings(season);
  const reg = D.teamGames.filter((r) => r.season === season && r.season_type === "Regular Season");
  const ps = D.playerSeasons.filter((r) => r.season === season && r.games >= 10);
  const playoff = D.playoffTeams.get(season) ?? new Set();
  if (!pinned.size) st.slice(0, 2).forEach((r) => pinned.add(r.team_id));
  const leader = st[0], scorer = d3.greatest(ps, (r) => r.ppg);

  app.innerHTML = `
    <section class="hero">
      <div>
        <span class="kicker">The ${season} season</span>
        <h1>Every possession, <em>on the record.</em></h1>
        <p class="dek">Standings, scoring and efficiency for the ${season} WNBA season — straight from the box scores, recomputed in your browser.</p>
      </div>
      <dl class="stats">
        <div class="stat"><dt>Games played</dt><dd>${int(new Set(reg.map((r) => r.game_id)).size)}</dd></div>
        <div class="stat"><dt>Points / team / game</dt><dd>${f1(d3.mean(reg, (r) => r.points_for))}</dd></div>
        <div class="stat"><dt>Best record</dt><dd>${leader ? `${leader.team}<small>${leader.wins}–${leader.losses}</small>` : "—"}</dd></div>
        <div class="stat"><dt>Scoring leader</dt><dd>${scorer ? `${f1(scorer.ppg)}<small>${esc(scorer.player_name.split(" ").slice(-1)[0])}</small>` : "—"}</dd></div>
      </dl>
    </section>

    <section class="section">
      ${sectionHead("01", "Standings", `Regular season only — Commissioner's Cup final and playoffs excluded.${playoff.size ? ` <span class="badge">P</span> made the playoffs.` : ""}`)}
      <div class="table-wrap"><table>
        <thead><tr><th class="l">#</th><th class="l">Team</th><th>W</th><th>L</th><th class="l">Win %</th><th>PPG</th><th>Opp</th><th>Diff</th><th class="l">Last 10</th></tr></thead>
        <tbody>${st.map((r, i) => {
          const t = D.teams.get(r.team_id);
          const cut = playoff.size && i === playoff.size - 1 && st.slice(0, playoff.size).every((x) => playoff.has(x.team_id));
          return `<tr data-href="#/teams/${t.abbreviation}" class="${cut ? "cutline" : ""}">
            <td class="l rank">${i + 1}</td>
            <td class="l"><span class="chip" style="${teamVars(t)}"></span><span class="name">${esc(t.display_name)}</span>${playoff.has(r.team_id) ? `<span class="badge" title="Made the playoffs">P</span>` : ""}</td>
            <td><b>${r.wins}</b></td><td>${r.losses}</td>
            <td class="l"><span class="pct-bar"><i style="width:${Math.round(r.win_pct * 70)}px"></i>${pct(r.win_pct)}</span></td>
            <td>${f1(r.ppg)}</td><td>${f1(r.opp_ppg)}</td>
            <td class="${r.diff_per_game >= 0 ? "pos" : "neg"}">${signed(r.diff_per_game)}</td>
            <td class="l"><span class="form" title="${r.last10.reduce((a, b) => a + b, 0)}–${r.last10.length - r.last10.reduce((a, b) => a + b, 0)} in last ${r.last10.length}">${r.last10.map((w) => `<i class="${w ? "w" : ""}"></i>`).join("")}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </section>

    <section class="section">
      ${sectionHead("02", "The race", "Wins piling up game by game. Pin teams to follow them — hover any line to see who it is, click it to pin.")}
      <div class="toolbar"><div class="teamchips" id="race-chips"></div></div>
      <div class="chart" id="race"></div>
    </section>

    <section class="section grid-2">
      <div>
        ${sectionHead("03", "Top scorers", "Points per game, top 15. Minimum 10 games.")}
        <div class="chart" id="scorers"></div>
      </div>
      <div>
        ${sectionHead("04", "Volume vs. efficiency", "Points per game against True Shooting %. Dashed lines are league medians; pinned teams light up.")}
        <div class="chart" id="eff"></div>
      </div>
    </section>`;

  app.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));

  // standings games only (the Cup final doesn't count), with their own running count
  const series = d3.group(reg.filter((r) => r.game_type === "STD").sort((a, b) => a.game_number - b.game_number), (r) => r.team_id);
  for (const [id, list] of series) {
    let w = 0;
    series.set(id, list.map((r, i) => ({ ...r, cumulative_wins: (w += r.win), game_number: i + 1 })));
  }
  const chipsEl = document.getElementById("race-chips");
  const drawChips = () => {
    chipsEl.innerHTML = st.map((r) => {
      const t = D.teams.get(r.team_id);
      return `<button type="button" data-id="${t.team_id}" aria-pressed="${pinned.has(t.team_id)}" style="--c:${teamInk(t)}" title="${esc(t.display_name)}">${t.abbreviation}</button>`;
    }).join("");
  };
  const toggle = (id) => { pinned.has(id) ? pinned.delete(id) : pinned.add(id); drawChips(); race.redraw(); eff.redraw(); };
  chipsEl.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) toggle(Number(b.dataset.id)); });
  drawChips();

  const race = raceChart(document.getElementById("race"), { series, teams: D.teams, pinned, onToggle: toggle });

  const top = [...ps].sort((a, b) => b.ppg - a.ppg).slice(0, 15);
  const scorers = barList(document.getElementById("scorers"), top, {
    value: (d) => d.ppg, label: (d) => d.player_name, sub: (d) => d.team, href: (d) => `#/players/${d.player_id}`,
    tip: (d) => `<b>${esc(d.player_name)}</b>${tipRows([["Team", d.team], ["PPG", f1(d.ppg)], ["GP", d.games], ["TS%", dash(d.ts_pct, pct)]])}`,
  });

  const effData = ps.filter((r) => r.ts_pct != null);
  const eff = scatter(document.getElementById("eff"), effData, {
    x: (d) => d.ppg, y: (d) => d.ts_pct, xTitle: "points per game", yTitle: "true shooting %", yFmt: pct0,
    highlight: (d) => pinned.has(d.team_id), colorOf: (d) => teamInk(D.teams.get(d.team_id)), href: (d) => `#/players/${d.player_id}`,
    tip: (d) => `<b>${esc(d.player_name)}</b>${tipRows([["Team", d.team], ["PPG", f1(d.ppg)], ["TS%", pct(d.ts_pct)], ["GP", d.games]])}`,
  });
  charts.push(race, scorers, eff);
}

// ── 02 · teams ───────────────────────────────────────────
function teamPage(abbr) {
  const st = standings(season);
  const t = (abbr && teamByAbbr(abbr)) || (st[0] && D.teams.get(st[0].team_id));
  if (!t) { app.innerHTML = `<p class="error">No teams for ${season}.</p>`; return; }
  const rec = st.find((r) => r.team_id === t.team_id);
  const rank = st.indexOf(rec) + 1;
  const games = D.teamGames.filter((r) => r.season === season && r.team_id === t.team_id)
    .sort((a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id));
  const roster = D.playerSeasons.filter((r) => r.season === season && r.team_id === t.team_id).sort((a, b) => b.ppg - a.ppg);
  const ink = teamInk(t);

  app.innerHTML = `
    <nav class="teamchips" aria-label="Teams">${[...st.map((r) => D.teams.get(r.team_id))].map((x) =>
      `<a href="#/teams/${x.abbreviation}" style="--c:${teamInk(x)}" ${x.team_id === t.team_id ? 'aria-current="page"' : ""} title="${esc(x.display_name)}">${x.abbreviation}</a>`).join("")}</nav>

    <section class="team-banner" style="${teamVars(t)};--on:${onColor(t.color)}">
      ${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : ""}
      <div><span class="kicker">${esc(t.location)} · ${rank ? `#${rank} in the standings` : "no regular-season games"}</span><h1>${esc(t.name)}</h1></div>
      <div class="record">${rec ? `${rec.wins}–${rec.losses}` : "—"}<small>regular season ${season}</small></div>
    </section>

    <dl class="stats wide">
      <div class="stat"><dt>Win %</dt><dd>${rec ? pct(rec.win_pct) : "—"}</dd></div>
      <div class="stat"><dt>Points / game</dt><dd>${rec ? f1(rec.ppg) : "—"}</dd></div>
      <div class="stat"><dt>Allowed / game</dt><dd>${rec ? f1(rec.opp_ppg) : "—"}</dd></div>
      <div class="stat"><dt>Diff / game</dt><dd>${rec ? signed(rec.diff_per_game) : "—"}</dd></div>
    </dl>

    <section class="section">
      ${sectionHead("01", "Game by game", "Final margin of every game, playoffs included. Above the line is a win.")}
      <div class="legend"><span style="--sw:${ink}">win margin</span><span style="--sw:var(--ghost)">loss margin</span></div>
      <div class="chart" id="margins"></div>
    </section>

    <section class="section grid-2">
      <div>
        ${sectionHead("02", "Rotation", "Regular-season averages for players whose latest game was with this team.")}
        ${roster.length ? `<div class="table-wrap"><table>
          <thead><tr><th class="l">Player</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th></tr></thead>
          <tbody>${roster.map((p) => `<tr data-href="#/players/${p.player_id}">
            <td class="l"><span class="name">${esc(p.player_name)}</span><span class="sub">${esc(p.position ?? "")}</span></td>
            <td>${p.games}</td><td>${f1(p.mpg)}</td><td><b>${f1(p.ppg)}</b></td><td>${f1(p.rpg)}</td><td>${f1(p.apg)}</td><td>${dash(p.ts_pct, pct)}</td></tr>`).join("")}
          </tbody></table></div>` : `<p class="empty-note">No regular-season games yet.</p>`}
      </div>
      <div>
        ${sectionHead("03", "Game log")}
        <div class="table-wrap"><table>
          <thead><tr><th class="l">Date</th><th class="l">Opp</th><th class="l">Stage</th><th class="l"></th><th>Score</th></tr></thead>
          <tbody>${[...games].reverse().map((g) => `<tr>
            <td class="l">${fmtDate(parseDate(g.game_date))}</td>
            <td class="l">${g.is_home ? "vs" : "@"} <a href="#/teams/${g.opponent}">${g.opponent}</a></td>
            <td class="l">${g.season_type === "Playoffs" ? '<span class="pos">Playoffs</span>' : g.game_type === "CC" ? "Cup final" : "Regular"}</td>
            <td class="l"><span class="wl ${g.win ? "w" : ""}">${g.win ? "W" : "L"}</span></td>
            <td>${g.points_for}–${g.points_against}</td></tr>`).join("")}
          </tbody></table></div>
      </div>
    </section>`;

  app.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => (location.hash = tr.dataset.href)));
  if (games.length) {
    charts.push(gameColumns(document.getElementById("margins"), games, {
      value: (d) => d.margin, color: (d) => (d.margin > 0 ? ink : "var(--ghost)"), yTitle: "margin",
      tip: (d) => `<b>${d.win ? "W" : "L"} ${d.points_for}–${d.points_against}</b>${tipRows([["Date", fmtDate(parseDate(d.game_date))], ["Opponent", `${d.is_home ? "vs" : "@"} ${d.opponent}`], ["Stage", d.season_type], ["Margin", d.margin > 0 ? `+${d.margin}` : d.margin]])}`,
    }));
  } else {
    document.getElementById("margins").innerHTML = `<p class="empty-note">No games yet.</p>`;
  }
}

// ── 03 · players ─────────────────────────────────────────
const PLAYER_COLS = [
  { k: "player_name", t: "Player", l: true }, { k: "position", t: "Pos", l: true }, { k: "jersey", t: "#" },
  { k: "games", t: "GP" }, { k: "mpg", t: "MIN", f: f1 }, { k: "ppg", t: "PTS", f: f1 }, { k: "rpg", t: "REB", f: f1 },
  { k: "apg", t: "AST", f: f1 }, { k: "ts_pct", t: "TS%", f: pct },
];
const playerView = { q: "", pos: "All", sort: "ppg", dir: -1 };

function playersPage() {
  const ps = new Map(D.playerSeasons.filter((r) => r.season === season).map((r) => [r.player_id, r]));
  const all = D.roster.map((p) => ({ ...p, ...ps.get(p.player_id), team: ps.get(p.player_id)?.team ?? p.team, player_name: p.player_name, position: p.position }));
  const positions = ["All", ...new Set(all.map((p) => p.position).filter(Boolean))].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));

  app.innerHTML = `
    <section class="hero">
      <div><span class="kicker">${all.length} players · ${season}</span><h1>The <em>roster</em> book.</h1>
      <p class="dek">Everyone who checked into a game. Averages are regular season; click a column to sort and a row to open the player.</p></div>
    </section>
    <section class="section">
      <div class="toolbar">
        <input type="search" id="q" placeholder="Search a player or team…" value="${esc(playerView.q)}" aria-label="Search players">
        <div class="seg" role="group" aria-label="Position">${positions.map((p) => `<button type="button" data-pos="${esc(p)}" aria-pressed="${p === playerView.pos}">${esc(p)}</button>`).join("")}</div>
        <span class="hint" id="count"></span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr>${PLAYER_COLS.map((c) => `<th class="${c.l ? "l" : ""}" data-sort="${c.k}">${c.t}</th>`).join("")}</tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
    </section>`;

  const tbody = document.getElementById("rows");
  const render = () => {
    const q = playerView.q.trim().toLowerCase();
    const list = all.filter((p) => (playerView.pos === "All" || p.position === playerView.pos)
      && (!q || `${p.player_name} ${p.team} ${p.team_name}`.toLowerCase().includes(q)));
    const k = playerView.sort, dir = playerView.dir;
    list.sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return a.player_name.localeCompare(b.player_name);
      if (x == null) return 1; if (y == null) return -1;
      const n = k === "jersey" ? Number(x) - Number(y) : typeof x === "string" ? x.localeCompare(y) : x - y;
      return n * dir || a.player_name.localeCompare(b.player_name);
    });
    document.getElementById("count").textContent = `${list.length} shown`;
    app.querySelectorAll("th[data-sort]").forEach((th) => {
      if (th.dataset.sort === k) th.setAttribute("aria-sort", dir < 0 ? "descending" : "ascending"); else th.removeAttribute("aria-sort");
    });
    tbody.innerHTML = list.map((p) => `<tr data-href="#/players/${p.player_id}">${PLAYER_COLS.map((c) => {
      if (c.k === "player_name") {
        const t = D.teams.get(p.team_id);
        return `<td class="l"><span class="chip" style="${t ? teamVars(t) : ""}"></span><span class="name">${esc(p.player_name)}</span><span class="sub">${esc(p.team)}</span></td>`;
      }
      const v = p[c.k];
      return `<td class="${c.l ? "l" : ""}">${v == null ? '<span class="sub">—</span>' : c.k === "ppg" ? `<b>${c.f(v)}</b>` : esc(c.f ? c.f(v) : v)}</td>`;
    }).join("")}</tr>`).join("");
  };
  document.getElementById("q").addEventListener("input", (e) => { playerView.q = e.target.value; render(); });
  app.querySelector(".seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    playerView.pos = b.dataset.pos;
    app.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  });
  app.querySelector("thead").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]"); if (!th) return;
    const k = th.dataset.sort;
    playerView.dir = playerView.sort === k ? -playerView.dir : (["player_name", "position", "jersey"].includes(k) ? 1 : -1);
    playerView.sort = k;
    render();
  });
  tbody.addEventListener("click", (e) => { const tr = e.target.closest("tr[data-href]"); if (tr) location.hash = tr.dataset.href; });
  render();
}

// ── player profile ───────────────────────────────────────
function playerPage(id) {
  const p = D.roster.find((r) => r.player_id === id);
  if (!p) { app.innerHTML = `<a class="back" href="#/players">← All players</a><p class="error">Player not found.</p>`; return; }
  const t = D.teams.get(p.team_id);
  const seasons = D.playerSeasons.filter((r) => r.player_id === id).sort((a, b) => b.season - a.season);
  const cur = seasons.find((r) => r.season === season) ?? seasons[0];
  const games = D.playerGames.filter((r) => r.player_id === id)
    .sort((a, b) => (a.game_date_time < b.game_date_time ? -1 : 1));
  const ink = teamInk(t);

  app.innerHTML = `
    <a class="back" href="#/players">← All players</a>
    <section class="player-head" style="${teamVars(t)};--photo:${[t.color, t.alternate_color].sort((a, b) => d3.hsl(b).l - d3.hsl(a).l)[0]}">
      <span class="jersey" aria-hidden="true">${esc(p.jersey ?? "")}</span>
      <figure class="${p.headshot ? "" : "empty"}">${p.headshot ? `<img src="${esc(p.headshot)}" alt="${esc(p.player_name)}">` : ""}</figure>
      <div>
        <span class="kicker">${esc(p.position ?? "")}${p.jersey ? ` · #${esc(p.jersey)}` : ""}</span>
        <h1>${esc(p.player_name)}</h1>
        <div class="meta"><a href="#/teams/${t.abbreviation}">${esc(t.display_name)}</a><span>${games.length} games logged</span></div>
      </div>
    </section>

    <dl class="stats wide">
      <div class="stat"><dt>Points</dt><dd>${cur ? f1(cur.ppg) : "—"}</dd></div>
      <div class="stat"><dt>Rebounds</dt><dd>${cur ? f1(cur.rpg) : "—"}</dd></div>
      <div class="stat"><dt>Assists</dt><dd>${cur ? f1(cur.apg) : "—"}</dd></div>
      <div class="stat"><dt>True shooting</dt><dd>${cur ? dash(cur.ts_pct, pct) : "—"}</dd></div>
    </dl>

    <section class="section">
      ${sectionHead("01", "Game by game", "Points scored each night, with Hollinger's Game Score traced on top — a one-number summary of the whole box line.")}
      <div class="legend"><span style="--sw:var(--orange)">points</span><span class="dot" style="--sw:${ink}">game score</span></div>
      <div class="chart" id="pgames"></div>
    </section>

    <section class="section">
      ${sectionHead("02", "Season averages", "Regular season.")}
      ${seasons.length ? `<div class="table-wrap"><table>
        <thead><tr><th class="l">Season</th><th class="l">Team</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TS%</th><th>eFG%</th><th>GmSc</th></tr></thead>
        <tbody>${seasons.map((s) => `<tr><td class="l">${s.season}</td><td class="l">${s.team}</td><td>${s.games}</td><td>${f1(s.mpg)}</td><td><b>${f1(s.ppg)}</b></td><td>${f1(s.rpg)}</td><td>${f1(s.apg)}</td><td>${f1(s.spg)}</td><td>${f1(s.bpg)}</td><td>${dash(s.ts_pct, pct)}</td><td>${dash(s.efg_pct, pct)}</td><td>${f1(s.avg_game_score)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="empty-note">No regular-season games played yet.</p>`}
    </section>

    <section class="section">
      ${sectionHead("03", "Box score log")}
      ${games.length ? `<div class="table-wrap"><table>
        <thead><tr><th class="l">Date</th><th class="l">Opp</th><th class="l">Stage</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3PT</th><th>FT</th><th>GmSc</th></tr></thead>
        <tbody>${[...games].reverse().map((g) => `<tr>
          <td class="l">${fmtDate(parseDate(g.game_date))}</td><td class="l"><a href="#/teams/${g.opponent}">${g.opponent}</a></td>
          <td class="l">${g.season_type === "Playoffs" ? '<span class="pos">Playoffs</span>' : "Regular"}</td>
          <td>${dash(g.minutes, d3.format(".0f"))}</td><td><b>${g.points}</b></td><td>${g.rebounds}</td><td>${g.assists}</td>
          <td>${g.field_goals_made}-${g.field_goals_attempted}</td><td>${g.three_point_field_goals_made}-${g.three_point_field_goals_attempted}</td>
          <td>${g.free_throws_made}-${g.free_throws_attempted}</td><td>${f1(g.game_score)}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
    </section>`;

  if (games.length) {
    charts.push(gameColumns(document.getElementById("pgames"), games, {
      value: (d) => d.points, color: () => "var(--orange)", yTitle: "pts",
      dots: { value: (d) => d.game_score, color: ink },
      tip: (d) => `<b>${d.points} pts vs ${d.opponent}</b>${tipRows([["Date", fmtDate(parseDate(d.game_date))], ["Game Score", f1(d.game_score)], ["REB / AST", `${d.rebounds} / ${d.assists}`], ["MIN", dash(d.minutes, d3.format(".0f"))]])}`,
    }));
  } else {
    document.getElementById("pgames").innerHTML = `<p class="empty-note">No games played yet.</p>`;
  }
}

boot();

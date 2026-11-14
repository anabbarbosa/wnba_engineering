// Loads the raw tables exported by scripts/export-data.js and derives every view the
// dashboard needs. This replaces the old Evidence SQL sources one for one:
//   teamGames    ← team_game.sql      teamSeasons   ← team_season.sql
//   playerGames  ← player_game.sql    playerSeasons ← player_season.sql
//   roster       ← players.sql

const BASE = `${import.meta.env.BASE_URL}data/`;

async function table(name) {
  const res = await fetch(`${BASE}${name}.json`);
  if (!res.ok) throw new Error(`missing data/${name}.json — run \`npm run data\` first`);
  const { columns, rows } = await res.json();
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
const mean = (xs, f) => (xs.length ? sum(xs, f) / xs.length : null);
const groupBy = (xs, key) => {
  const m = new Map();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

// Hollinger's Game Score
export const gameScore = (b) =>
  b.points + 0.4 * b.field_goals_made - 0.7 * b.field_goals_attempted
  - 0.4 * (b.free_throws_attempted - b.free_throws_made)
  + 0.7 * b.offensive_rebounds + 0.3 * b.defensive_rebounds + b.steals
  + 0.7 * b.assists + 0.7 * b.blocks - 0.4 * b.fouls - b.turnovers;

const stageOf = (g) => (g.season_type === 3 ? "Playoffs" : "Regular Season");
const byDate = (a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id);

export async function loadData() {
  const [teamsRaw, playersRaw, gamesRaw, boxRaw, meta] = await Promise.all([
    table("teams"), table("players"), table("games"), table("player_box"),
    fetch(`${BASE}meta.json`).then((r) => (r.ok ? r.json() : {})),
  ]);

  const teams = new Map(teamsRaw.map((t) => [t.team_id, { ...t, color: `#${t.color}`, alternate_color: `#${t.alternate_color}` }]));
  const people = new Map(playersRaw.map((p) => [p.player_id, p]));
  const games = gamesRaw.filter((g) => g.is_completed);
  const gameById = new Map(games.map((g) => [g.game_id, g]));

  // ── team_game: one row per team per finished game, with running win total
  const teamGames = [];
  for (const g of games) {
    for (const home of [true, false]) {
      const team = teams.get(home ? g.home_team_id : g.away_team_id);
      const opp = teams.get(home ? g.away_team_id : g.home_team_id);
      const pf = home ? g.home_score : g.away_score;
      const pa = home ? g.away_score : g.home_score;
      teamGames.push({
        game_id: g.game_id, season: g.season, season_type: stageOf(g), game_type: g.game_type,
        game_date: g.game_date, team_id: team.team_id, team: team.abbreviation, team_name: team.display_name,
        opponent: opp.abbreviation, opponent_id: opp.team_id, is_home: home,
        points_for: pf, points_against: pa, margin: pf - pa, win: pf > pa ? 1 : 0,
      });
    }
  }
  for (const rows of groupBy(teamGames, (r) => `${r.team_id}|${r.season}|${r.season_type}`).values()) {
    rows.sort(byDate);
    let wins = 0;
    rows.forEach((r, i) => { wins += r.win; r.cumulative_wins = wins; r.game_number = i + 1; });
  }

  // ── team_season: regular-season standings (Commissioner's Cup final and playoffs excluded)
  const teamSeasons = [];
  for (const rows of groupBy(teamGames.filter((r) => r.game_type === "STD"), (r) => `${r.team_id}|${r.season}`).values()) {
    const { season, team_id, team, team_name } = rows[0];
    const wins = sum(rows, (r) => r.win);
    teamSeasons.push({
      season, team_id, team, team_name, games: rows.length, wins, losses: rows.length - wins,
      win_pct: wins / rows.length, ppg: mean(rows, (r) => r.points_for), opp_ppg: mean(rows, (r) => r.points_against),
      diff_per_game: mean(rows, (r) => r.margin),
      last10: rows.sort(byDate).slice(-10).map((r) => r.win),
    });
  }
  // playoff field = every team that played a postseason game
  const playoffTeams = new Map();
  for (const r of teamGames) {
    if (r.season_type !== "Playoffs") continue;
    if (!playoffTeams.has(r.season)) playoffTeams.set(r.season, new Set());
    playoffTeams.get(r.season).add(r.team_id);
  }

  // ── player_game: one row per player per game played, with Game Score
  const playerGames = [];
  for (const b of boxRaw) {
    const g = gameById.get(b.game_id);
    if (!g || b.did_not_play || b.points == null) continue;
    playerGames.push({
      ...b, season: g.season, season_type: stageOf(g), game_type: g.game_type, game_date: g.game_date,
      game_date_time: g.game_date_time, player_name: people.get(b.player_id)?.display_name,
      team: teams.get(b.team_id)?.abbreviation, opponent: teams.get(b.opponent_team_id)?.abbreviation,
      game_score: gameScore(b),
    });
  }

  // ── player_season: regular-season averages per player, with shooting efficiency
  const playerSeasons = [];
  for (const rows of groupBy(playerGames.filter((r) => r.game_type === "STD"), (r) => `${r.player_id}|${r.season}`).values()) {
    rows.sort(byDate);
    const p = people.get(rows[0].player_id);
    const fga = sum(rows, (r) => r.field_goals_attempted);
    const fta = sum(rows, (r) => r.free_throws_attempted);
    const tsDen = 2 * (fga + 0.44 * fta);
    playerSeasons.push({
      season: rows[0].season, player_id: p.player_id, player_name: p.display_name, position: p.position,
      team: rows.at(-1).team, team_id: rows.at(-1).team_id, games: rows.length,
      mpg: mean(rows, (r) => r.minutes), ppg: mean(rows, (r) => r.points), rpg: mean(rows, (r) => r.rebounds),
      apg: mean(rows, (r) => r.assists), spg: mean(rows, (r) => r.steals), bpg: mean(rows, (r) => r.blocks),
      ts_pct: tsDen ? sum(rows, (r) => r.points) / tsDen : null,
      efg_pct: fga ? (sum(rows, (r) => r.field_goals_made) + 0.5 * sum(rows, (r) => r.three_point_field_goals_made)) / fga : null,
      avg_game_score: mean(rows, (r) => r.game_score),
    });
  }

  // ── players: everyone who appeared in a box score, with their most recent team and jersey
  const roster = [];
  for (const rows of groupBy(boxRaw, (b) => b.player_id).values()) {
    const last = rows.reduce((a, b) =>
      (gameById.get(b.game_id)?.game_date_time ?? "") > (gameById.get(a.game_id)?.game_date_time ?? "") ? b : a);
    const p = people.get(last.player_id);
    const t = teams.get(last.team_id);
    roster.push({
      player_id: p.player_id, player_name: p.display_name, position: p.position, headshot: p.headshot,
      team: t.abbreviation, team_id: t.team_id, team_name: t.display_name, jersey: last.jersey,
    });
  }

  const seasons = [...new Set(teamSeasons.map((r) => r.season))].sort((a, b) => b - a);
  return { meta, teams, seasons, teamGames, teamSeasons, playoffTeams, playerGames, playerSeasons, roster };
}

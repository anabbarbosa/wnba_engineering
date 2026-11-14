// Dumps the raw tables the ETL loaded into Postgres to public/data/*.json.
// No business logic here: standings, averages and Game Score are computed in the browser (src/stats.js).
//
//   npm run data
//
// Connection: WNBA_PG_URL from the repo-root .env (the same one the ETL uses). Fallback:
// PGHOST / PGPORT / PGDATABASE / PGUSER (defaults localhost:5432, wnba, postgres) + WNBA_DB_PASSWORD or PGPASSWORD.

import { mkdir, writeFile } from "node:fs/promises";
import pg from "pg";

const OUT_DIR = new URL("../public/data/", import.meta.url);

const TABLES = {
  teams: {
    table: "team",
    columns: ["team_id", "abbreviation", "display_name", "short_display_name", "location", "name", "color", "alternate_color", "logo"],
  },
  players: {
    table: "player",
    columns: ["player_id", "display_name", "short_name", "position", "position_abbreviation", "headshot"],
  },
  games: {
    table: "games",
    columns: ["game_id", "season", "season_type", "game_type", "game_type_name", "game_date", "game_date_time",
              "is_completed", "home_team_id", "away_team_id", "home_score", "away_score", "attendance"],
  },
  player_box: {
    table: "player_box",
    columns: ["game_id", "player_id", "team_id", "opponent_team_id", "jersey", "starter", "did_not_play", "minutes",
              "points", "field_goals_made", "field_goals_attempted", "three_point_field_goals_made",
              "three_point_field_goals_attempted", "free_throws_made", "free_throws_attempted",
              "offensive_rebounds", "defensive_rebounds", "rebounds", "assists", "steals", "blocks",
              "turnovers", "fouls"],
  },
};

const client = new pg.Client(process.env.WNBA_PG_URL ? { connectionString: process.env.WNBA_PG_URL } : {
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "wnba",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.WNBA_DB_PASSWORD ?? process.env.PGPASSWORD,
});

// dates as plain yyyy-mm-dd strings, not JS Date objects shifted by the local timezone
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

await client.connect();
await mkdir(OUT_DIR, { recursive: true });

for (const [name, { table, columns }] of Object.entries(TABLES)) {
  const cols = columns.map((c) => client.escapeIdentifier(c)).join(", ");
  const { rows } = await client.query(`select ${cols} from wnba.${client.escapeIdentifier(table)}`);
  // column-oriented rows keep the files small: { columns: [...], rows: [[...], ...] }
  const body = { columns, rows: rows.map((r) => columns.map((c) => r[c])) };
  await writeFile(new URL(`${name}.json`, OUT_DIR), JSON.stringify(body));
  console.log(`  ${name.padEnd(11)} ${String(rows.length).padStart(6)} rows`);
}

await writeFile(new URL("meta.json", OUT_DIR), JSON.stringify({ exported_at: new Date().toISOString() }));
await client.end();
console.log("✅ dashboard data written to public/data/");

<div align="center">

# 🏀 WNBA Engineering

**A WNBA data pipeline: from the ESPN API to a modeled, analysis-ready Postgres database.**

![Python](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)
![Polars](https://img.shields.io/badge/Polars-1.x-CD792C?logo=polars&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-ADBC-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)
![uv](https://img.shields.io/badge/uv-package%20manager-DE5FE9?logo=uv&logoColor=white)

</div>

---

## ✨ About

ESPN publishes data for every WNBA game, but it arrives **messy**: duplicated columns for the home and away teams, JSON embedded in text fields, abbreviations instead of names, numeric stats stored as text, and team and player details repeated on every row.

This project takes that raw data and turns it into a **clean dimensional model**: fact and dimension tables linked by keys and loaded into Postgres. The goal is that any question about the season can be answered with a `JOIN`.

> _Who was the season's top scorer? Does home court make a difference? How did each quarter of the Finals play out?_

---

## 🔄 How it works

```mermaid
flowchart LR
    A[("🌐 ESPN<br/>via sportsdataverse")] -->|extract| B["📦 pulled_data/<br/>raw parquet"]
    B -->|transform| C["✨ transformed_data/<br/>7 parquet tables"]
    C -->|load| D[("🐘 PostgreSQL<br/>wnba schema")]
```

| Step | What it does |
|---|---|
| **Extract** | Downloads each season's schedule, team box scores and player box scores, and stores the raw data as Parquet. |
| **Transform** | Cleans, types and normalizes the data with **Polars**: splits facts from dimensions, parses the embedded JSON, expands abbreviations and drops redundant columns. |
| **Load** | Combines every processed season and loads it into Postgres in a **single transaction**, with primary keys. |

---

## 🗂️ Data model

```mermaid
erDiagram
    games ||--o{ linescore : "game_id"
    games ||--o{ team_box : "game_id"
    games ||--o{ player_box : "game_id"
    venue ||--o{ games : "venue_id"
    team ||--o{ games : "home_team_id / away_team_id"
    team ||--o{ team_box : "team_id"
    team ||--o{ player_box : "team_id"
    player ||--o{ player_box : "player_id"

    games {
        int game_id PK
        date game_date
        string game_type_name
        int home_team_id FK
        int away_team_id FK
        int home_score
        int away_score
        int venue_id FK
    }
    linescore {
        int game_id PK
        int period PK
        int home_points
        int away_points
        bool is_overtime
    }
    team_box {
        int game_id PK
        int team_id PK
        int opponent_team_id FK
        int assists
        int total_rebounds
        int points_in_paint
    }
    player_box {
        int game_id PK
        int player_id PK
        int team_id FK
        string minutes
        int points
        int rebounds
        int assists
    }
    team {
        int team_id PK
        string display_name
        string abbreviation
        string color
    }
    player {
        int player_id PK
        string display_name
        string position
    }
    venue {
        int venue_id PK
        string name
        string city
        string state
    }
```

| Table | Type | One row per… | 2026 season |
|---|---|---|---:|
| `games` | fact | game | 354 |
| `linescore` | fact | period of each game | 1,430 |
| `team_box` | fact | team per game | 706 |
| `player_box` | fact | player per game | 8,571 |
| `team` | dimension | team | 15 |
| `player` | dimension | player | 245 |
| `venue` | dimension | arena | 26 |

---

## 🧹 Data cleaning

Issues found in the source data and how the transform step handles them:

- **Home vs. away:** dozens of `home_*` / `away_*` columns become plain IDs, and team details live only in `team`.
- **Points per quarter:** these came as text shaped like a Python list, and the number of overtimes varies from game to game. They became the `linescore` table, with one row per period. In every game, the periods add up to the final score.
- **Team records:** the text `"30-14"` became numeric win and loss columns (overall, home and road).
- **Readable labels:** `CA → California`, `PQ → Quebec` (ESPN's code for it), `RD16 → First Round`. The lookup includes Canadian provinces, since the league plays in Toronto, Vancouver and Montreal.
- **Out-of-scope games:** the All-Star Game and postponed games are excluded.
- **Commissioner's Cup:** the source never flags these games (the flag is always `false`). The transform detects them from the game notes and creates `is_commissioners_cup`.
- **Fixed types:** stats such as `points_in_paint` and `fast_break_points` arrived as text and are now integers.
- **Player short names:** ESPN sometimes switches formats. The transform prefers the "F. Lastname" pattern.
- **Jersey per game:** jersey numbers change with trades, so they live in `player_box`, not `player`.
- **Multiple seasons:** facts from every season are combined; teams, players and arenas keep their most recent version.

---

## 📁 Project structure

```
wnba-engineering/
├── main.py                      # CLI (click): python main.py execute ...
├── pyproject.toml
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.dockerignore
│   └── docker-compose.yml       # etl service + parquet volumes
└── wnba_engineering/
    └── etl/
        ├── controller.py        # extract · transform · load
        ├── notebooks/           # exploration
        ├── pulled_data/         # generated: raw data per season
        └── transformed_data/    # generated: clean tables per season
```

---

## 🚀 Getting started

### 1. Configure the database

Create a `.env` file in the project root with your Postgres connection:

```env
WNBA_PG_URL=postgresql://user:password@host:5432/database
```

> 🔒 `.env` is in `.gitignore`, so your password stays out of the repository.
> The database user needs permission to create schemas and tables. Tables are created in the `wnba` schema.

### 2a. Run with Docker (recommended)

```bash
# build the image
docker compose -f docker/docker-compose.yml build

# full pipeline (extract + transform + load) for the 2026 season
docker compose -f docker/docker-compose.yml run --rm etl

# choosing steps and seasons
docker compose -f docker/docker-compose.yml run --rm etl execute --season 2025 --season 2026
docker compose -f docker/docker-compose.yml run --rm etl execute --transform --load
```

The Parquet files are stored in the `wnba_pulled_data` and `wnba_transformed_data` volumes, so they persist between runs.

> ⚠️ `docker compose down -v` deletes the volumes. After that, the next load only includes the seasons you process again.

### 2b. Run locally with uv

```bash
uv sync
uv run --env-file .env main.py execute
```

### ⚙️ `execute` options

| Command | What runs |
|---|---|
| `execute` | all three steps |
| `execute --extract --transform` | download and transform, without loading into the database |
| `execute --transform --load` | transform what was already downloaded, then load |
| `execute --load` | only load what is in `transformed_data/` |
| `execute --season 2025 --season 2026` | multiple seasons (default: `2026`) |

### 3. Query it!

```sql
-- season scoring leaders (minimum 10 games)
SELECT p.display_name, t.abbreviation AS team, round(avg(pb.points), 1) AS ppg
FROM wnba.player_box pb
JOIN wnba.player p USING (player_id)
JOIN wnba.team   t USING (team_id)
WHERE NOT pb.did_not_play
GROUP BY 1, 2
HAVING count(*) >= 10
ORDER BY ppg DESC
LIMIT 10;
```

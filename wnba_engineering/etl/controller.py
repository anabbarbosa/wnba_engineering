import argparse
import logging
import os
from pathlib import Path

import polars as pl

log = logging.getLogger(__name__)

ETL_DIR = Path(__file__).resolve().parent
ROOT_DIR = ETL_DIR.parents[1]
PULLED_DIR = ETL_DIR / "pulled_data"
TRANSFORMED_DIR = ETL_DIR / "transformed_data"
# Postgres da VPS: postgresql://usuario:senha@host:5432/banco (nunca commitar a senha)
PG_URL_ENV = "WNBA_PG_URL"
PG_SCHEMA = "wnba"

TABLES = {
    "games": None,
    "linescore": None,
    "player_box": None,
    "team_box": None,
    "team": "team_id",
    "venue": "venue_id",
    "player": "player_id",
}

PRIMARY_KEYS = {
    "games": ["game_id"],
    "linescore": ["game_id", "period"],
    "player_box": ["game_id", "player_id"],
    "team_box": ["game_id", "team_id"],
    "team": ["team_id"],
    "venue": ["venue_id"],
    "player": ["player_id"],
}

STATE_NAMES = {
    # EUA
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming", "PR": "Puerto Rico",
    "AB": "Alberta", "BC": "British Columbia", "MB": "Manitoba", "NB": "New Brunswick",
    "NL": "Newfoundland and Labrador", "NS": "Nova Scotia", "ON": "Ontario",
    "PE": "Prince Edward Island", "PQ": "Quebec", "QC": "Quebec", "SK": "Saskatchewan",
}

GAME_TYPE_NAMES = {
    "STD": "Regular Season",
    "CC": "Commissioner's Cup Championship",
    "RD16": "First Round",  
    "SEMI": "Semifinals",
    "FINAL": "Finals",
    "ALLSTAR": "All-Star Game",
}

TEAM_ATTRS = [
    "id", "uid", "location", "name", "abbreviation", "display_name",
    "short_display_name", "color", "alternate_color", "is_active",
    "venue_id", "logo", "logo_dark",
]

TEAM_DETAIL_COLS = [
    "name", "location", "short_display_name", "display_name", "uid", "slug",
    "logo", "abbreviation", "color", "alternate_color",
]

PLAYER_COLS = {
    "athlete_id": "player_id",
    "athlete_display_name": "display_name",
    "athlete_short_name": "short_name",
    "athlete_position_name": "position",
    "athlete_position_abbreviation": "position_abbreviation",
    "athlete_headshot_href": "headshot",
}
VENUE_COLS = ["venue_full_name", "venue_address_city", "venue_address_state", "venue_indoor"]

N_QUARTERS = 4
MAX_OT = 4 
PERIOD_NAMES = [f"q{n}" for n in range(1, N_QUARTERS + 1)] + [f"ot{n}" for n in range(1, MAX_OT + 1)]


def extract(season: int) -> dict[str, pl.DataFrame]:
    from sportsdataverse.wnba import (
        load_wnba_player_boxscore,
        load_wnba_schedule,
        load_wnba_team_boxscore,
    )

    raw = {
        "schedule": load_wnba_schedule(seasons=season),
        "player_box": load_wnba_player_boxscore(seasons=season),
        "team_box": load_wnba_team_boxscore(seasons=season),
    }

    out_dir = PULLED_DIR / str(season)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in raw.items():
        df.write_parquet(out_dir / f"{name}.parquet")
        log.info("extract %s: %s -> %s", name, df.shape, out_dir / f"{name}.parquet")

    return raw


# transform

def _parse_linescores(side: str) -> list[pl.Expr]:
    periods = (
        pl.col(f"{side}_linescores")
        .str.extract_all(r"'value': (-?[\d.]+)")
        .list.eval(pl.element().str.extract(r"([\d.]+)$").cast(pl.Float64).cast(pl.Int32))
    )
    return [periods.list.get(i, null_on_oob=True).alias(f"{side}_{n}") for i, n in enumerate(PERIOD_NAMES)]


def _parse_records(side: str) -> list[pl.Expr]:
    exprs = []
    for rec_type in ("total", "home", "road"):
        summary = pl.col(f"{side}_records").str.extract(rf"'type': '{rec_type}', 'summary': '(\d+-\d+)'")
        label = "overall" if rec_type == "total" else rec_type
        exprs += [
            summary.str.split("-").list.get(0).cast(pl.Int32).alias(f"{side}_{label}_wins"),
            summary.str.split("-").list.get(1).cast(pl.Int32).alias(f"{side}_{label}_losses"),
        ]
    return exprs


def transform_schedule(schedule: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    team = (
        pl.concat([
            schedule.filter(pl.col("type_abbreviation") != "ALLSTAR")
            .select([pl.col(f"{s}_{a}").alias(a) for a in TEAM_ATTRS])
            for s in ("home", "away")
        ])
        .unique(subset="id", keep="last")
        .rename({"id": "team_id"})
        .sort("team_id")
    )

    team_attr_cols = [f"{s}_{a}" for s in ("home", "away") for a in TEAM_ATTRS if a != "id"]

    games = (
        schedule.filter(
            (pl.col("type_abbreviation") != "ALLSTAR")
            & (pl.col("status_type_name") != "STATUS_POSTPONED")
        )
        .with_columns(
            *_parse_linescores("home"), *_parse_linescores("away"),
            *_parse_records("home"), *_parse_records("away"),
            pl.col("venue_address_state")
            .replace_strict(STATE_NAMES, default=pl.col("venue_address_state")),
        )
        .drop(*team_attr_cols, "home_linescores", "away_linescores", "home_records", "away_records")
        .drop(pl.col("^broadcast.*$"))
        .rename({
            "home_id": "home_team_id",
            "away_id": "away_team_id",
            "status_type_completed": "is_completed",
            "status_type_name": "game_status",
            "status_period": "num_periods",
        })
        .with_columns(pl.col("num_periods").cast(pl.Int32))
        .drop(pl.col("^status_.*$"))  
        .sort("game_date_time")
    )

    venue = (
        games.select("venue_id", *VENUE_COLS).unique(subset="venue_id", keep="last")
        .rename({
            "venue_full_name": "name",
            "venue_address_city": "city",
            "venue_address_state": "state",
            "venue_indoor": "is_indoor",
        })
        .sort("venue_id")
    )

    def side_periods(side: str) -> pl.DataFrame:
        return (
            games.filter("is_completed")  
            .select("game_id", *[pl.col(f"{side}_{p}").alias(str(n)) for n, p in enumerate(PERIOD_NAMES, 1)])
            .unpivot(index="game_id", variable_name="period", value_name=f"{side}_points")
        )

    linescore = (
        side_periods("home")
        .join(side_periods("away"), on=["game_id", "period"])
        .filter(pl.col("home_points").is_not_null() & pl.col("away_points").is_not_null())
        .with_columns(pl.col("period").cast(pl.Int32))
        .with_columns((pl.col("period") > N_QUARTERS).alias("is_overtime"))
        .sort("game_id", "period")
    )

    games = (
        games.drop(*VENUE_COLS).drop([f"{s}_{p}" for s in ("home", "away") for p in PERIOD_NAMES]) 
        .with_columns(
            pl.col("notes_headline").replace("", None).alias("game_note"),
            pl.col("notes_headline").str.contains("Commissioner's Cup").alias("is_commissioners_cup"),
        )
        .rename({"type_abbreviation": "game_type"})
        .with_columns(
            pl.col("game_type")
            .replace_strict(GAME_TYPE_NAMES, default=pl.col("game_type"))
            .alias("game_type_name")
        )
        .drop(
            "id",                         
            "uid",                        
            "date", "start_date",         
            "time_valid", "recent",       
            "format_regulation_periods",  
            "conference_competition",     
            "notes_type", "notes_headline",
            "type_id",                    
            "away_winner",                
            "highlights",                 
            "game_json_url",
            "play_by_play_available", "PBP", "game_json", "team_box", "player_box",
        )
    )

    first_cols = [
        "game_id", "season", "season_type", "game_type", "game_type_name", "game_note", "is_commissioners_cup",
        "game_date", "game_date_time",
        "game_status", "is_completed", "num_periods",
        "venue_id", "neutral_site", "attendance",
        "home_team_id", "away_team_id", "home_score", "away_score", "home_winner",
    ]
    games = games.select(*first_cols, pl.exclude(first_cols))

    return games, team, venue, linescore



def transform_player_box(player_box: pl.DataFrame, games: pl.DataFrame) -> tuple[pl.DataFrame, pl.DataFrame]:
    box = player_box.filter(pl.col("game_id").is_in(games["game_id"].implode()))

    player = (
        box.sort(
            pl.col("athlete_short_name").str.contains(r"^\S+\. ").fill_null(False),
            "game_date_time",
            descending=True,
        )
        .unique(subset="athlete_id", keep="first")
        .select(list(PLAYER_COLS))
        .rename(PLAYER_COLS)
        .sort("player_id")
    )

    box = (
        box.drop(
            [f"team_{c}" for c in TEAM_DETAIL_COLS],
            [f"opponent_team_{c}" for c in TEAM_DETAIL_COLS],
            "season", "season_type", "game_date", "game_date_time",
            "home_away", "team_winner", "team_score", "opponent_team_score",
            *[c for c in PLAYER_COLS if c != "athlete_id"],
            strict=False,
        )\
        .rename({"athlete_id": "player_id", "athlete_jersey": "jersey"})
    )

    return box, player

def transform_team_box(team_box: pl.DataFrame, games: pl.DataFrame) -> pl.DataFrame:
    str_stats = [
        "fast_break_points", "points_in_paint", "turnover_points",
        "largest_lead", "lead_changes", "lead_percentage",
    ]

    return (
        team_box.filter(pl.col("game_id").is_in(games["game_id"].implode()))
        .drop(
            [f"team_{c}" for c in TEAM_DETAIL_COLS],
            [f"opponent_team_{c}" for c in TEAM_DETAIL_COLS],
            "season", "season_type", "game_date", "game_date_time",
            "team_home_away", "team_winner", "team_score", "opponent_team_score",
            "total_technical_fouls",
            strict=False,
        )
        .with_columns(pl.col(str_stats).cast(pl.Int32))
    )

def transform(raw: dict[str, pl.DataFrame], season: int) -> dict[str, pl.DataFrame]:
    games, team, venue, linescore = transform_schedule(raw["schedule"])
    player_box, player = transform_player_box(raw["player_box"], games)
    team_box = transform_team_box(raw["team_box"], games)

    tables = {
        "games": games,
        "linescore": linescore,
        "player_box": player_box,
        "team_box": team_box,
        "team": team,
        "venue": venue,
        "player": player,
    }
    assert tables.keys() == TABLES.keys(), f"tabelas do transform != TABLES: {tables.keys() ^ TABLES.keys()}"

    out_dir = TRANSFORMED_DIR / str(season)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        df.write_parquet(out_dir / f"{name}.parquet")
        log.info("transform %s: %s -> %s", name, df.shape, out_dir / f"{name}.parquet")

    return tables


def _read_all_seasons(name: str, key: str | None) -> tuple[pl.DataFrame | None, int]:
    """Junta a tabela de todas as temporadas em transformed_data/.
    Dimensão (key != None): uma linha por chave, ficando a versão da temporada mais recente."""
    files = sorted(TRANSFORMED_DIR.glob(f"*/{name}.parquet"))  # a pasta é o ano: ordem crescente
    if not files:
        return None, 0

    # temporada mais recente primeiro; diagonal_relaxed tolera colunas diferentes entre temporadas
    df = pl.concat([pl.read_parquet(f) for f in reversed(files)], how="diagonal_relaxed")
    if key is not None:
        df = df.unique(subset=key, keep="first", maintain_order=True).sort(key)
    return df, len(files)


def load(pg_url: str | None = None, schema: str = PG_SCHEMA) -> None:
    """Sobe TODAS as temporadas de transformed_data/ para o Postgres (schema `wnba`).

    Cada tabela é recriada (DROP + CREATE) e ganha primary key, tudo numa transação só:
    se algo falhar no meio, o banco fica como estava.
    """
    import adbc_driver_postgresql.dbapi as pg_dbapi

    pg_url = pg_url or os.environ.get(PG_URL_ENV)
    if not pg_url:
        raise RuntimeError(f"defina {PG_URL_ENV}=postgresql://usuario:senha@host:5432/banco")

    with pg_dbapi.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')

        for name, key in TABLES.items():
            df, n_seasons = _read_all_seasons(name, key)
            if df is None:
                log.warning("load %s: nenhum parquet encontrado, pulando", name)
                continue

            cur.execute(f'DROP TABLE IF EXISTS "{schema}"."{name}"')
            cur.adbc_ingest(name, df.to_arrow(), mode="create", db_schema_name=schema)
            pk = ", ".join(f'"{c}"' for c in PRIMARY_KEYS[name])
            cur.execute(f'ALTER TABLE "{schema}"."{name}" ADD PRIMARY KEY ({pk})')
            log.info("load %s.%s: %d linhas (%d temporada(s))", schema, name, df.height, n_seasons)

        conn.commit()

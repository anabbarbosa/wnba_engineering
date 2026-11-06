import logging

import click
import polars as pl

from wnba_engineering.etl.controller import PULLED_DIR, extract, load, transform

RAW_TABLES = ["schedule", "player_box", "team_box"]


def read_pulled(season: int) -> dict[str, pl.DataFrame]:
    season_dir = PULLED_DIR / str(season)
    missing = [t for t in RAW_TABLES if not (season_dir / f"{t}.parquet").exists()]
    if missing:
        raise click.ClickException(
            f"season {season}: missing {missing} in {season_dir}. Run with --extract."
        )
    return {t: pl.read_parquet(season_dir / f"{t}.parquet") for t in RAW_TABLES}


@click.group()
def cli() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")


@cli.command()
@click.option("--extract", "do_extract", is_flag=True, help="Download the raw data into pulled_data/.")
@click.option("--transform", "do_transform", is_flag=True, help="Build the tables in transformed_data/.")
@click.option("--load", "do_load", is_flag=True, help="Load every season into Postgres.")
@click.option("--season", "seasons", type=int, multiple=True, default=[2026], show_default=True,
              help="Season; repeat for several (--season 2025 --season 2026).")
def execute(do_extract: bool, do_transform: bool, do_load: bool, seasons: tuple[int, ...]) -> None:
    if not (do_extract or do_transform or do_load):
        do_extract = do_transform = do_load = True

    if do_extract or do_transform:
        for season in seasons:
            logging.info("==== season %d ====", season)
            raw = extract(season) if do_extract else read_pulled(season)
            if do_transform:
                transform(raw, season)

    if do_load:
        load()


if __name__ == "__main__":
    cli()

import logging
import shutil
import subprocess

import click

from wnba_engineering.controller import ROOT_DIR
from wnba_engineering.etl.controller import ETLController

DASHBOARD_DIR = ROOT_DIR / "wnba_engineering" / "dashboard"


def _run_dashboard(serve: bool):
    """export the Postgres tables to dashboard/public/data and, optionally, start the dev server"""
    npm = shutil.which("npm")
    if npm is None:
        print("❌ error: npm not found. Install Node.js to run the dashboard.")
        return
    if not (DASHBOARD_DIR / "node_modules").exists():
        print("📦 installing dashboard dependencies...")
        subprocess.run([npm, "install"], cwd=DASHBOARD_DIR, check=True)

    print("🔄 refreshing dashboard data...")
    subprocess.run([npm, "run", "data"], cwd=DASHBOARD_DIR, check=True)

    if serve:
        print("🌐 starting the dashboard at http://localhost:3000 (ctrl+c to stop)")
        subprocess.run([npm, "run", "dev"], cwd=DASHBOARD_DIR)


@click.command()
@click.option('--etl', type=click.BOOL, required=True, help="Run the ETL.")
@click.option('--dashboard', type=click.BOOL, default=False, show_default=True,
              help="Refresh the dashboard data and start the dev server.")
@click.option('--extract', type=click.BOOL, default=True, show_default=True,
              help="ETL step: download the raw data into pulled_data/.")
@click.option('--transform', type=click.BOOL, default=True, show_default=True,
              help="ETL step: build the tables in transformed_data/.")
@click.option('--load', type=click.BOOL, default=True, show_default=True,
              help="ETL step: load every season into Postgres.")
@click.option('--season', type=click.INT, multiple=True, default=[2026], show_default=True,
              help="Season; repeat for several (--season 2025 --season 2026).")
@click.option('--serve', type=click.BOOL, default=True, show_default=True,
              help="With --dashboard 1: start the dev server after refreshing the data.")

def run(etl, dashboard, extract, transform, load, season, serve):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")

    if not (etl or dashboard):
        print("⚠️ nothing to do: use --etl 1 and/or --dashboard 1")
        return

    if etl:
        print(f"ETL parameters - seasons: {list(season)}, extract: {extract}, transform: {transform}, load: {load}")
        controller = ETLController()
        try:
            controller.etl(seasons=season, extract=extract, transform=transform, load=load)
        except (FileNotFoundError, RuntimeError) as e:
            print(f"❌ error: {e}")
            raise SystemExit(1)
        print("✅ etl completed!")

    if dashboard:
        _run_dashboard(serve=serve)

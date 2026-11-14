import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]

# .env in the repo root (WNBA_PG_URL); variables already set in the environment win (e.g. Docker)
load_dotenv(ROOT_DIR / ".env", override=False)


class ProjectUtils():

    def __init__(self):
        self.root_dir = ROOT_DIR
        self.package_dir = ROOT_DIR / "wnba_engineering"
        self.pg_url = os.getenv("WNBA_PG_URL")
        self.pg_schema = os.getenv("WNBA_PG_SCHEMA", "wnba")


class UtilsABC(ProjectUtils):

    def extract(self, season: int):
        """
        handle data extraction for the project.

        :param season: season (year) to extract.
        :return: the raw tables of the season.
        :rtype: dict[str, polars.DataFrame]

        """
        raise NotImplementedError

    def transform(self, raw, season: int):
        """
        handle data transformation for the project.

        :param raw: the raw tables returned by `extract`.
        :param season: season (year) being transformed.
        :return: the clean tables of the season.
        :rtype: dict[str, polars.DataFrame]

        """
        raise NotImplementedError

    def load(self):
        """
        handle data loading for the project.

        :return: None
        :rtype: None

        """
        raise NotImplementedError

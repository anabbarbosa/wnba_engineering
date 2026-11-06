# Imagem do ETL da WNBA.
#
# Build (na raiz do repo):
#   docker build -f docker/Dockerfile -t wnba-etl .
#
# Rodar (WNBA_PG_URL vem do .env; os volumes guardam os parquets entre execuções,
# para o load juntar todas as temporadas já processadas):
#   docker run --rm --env-file .env \
#     -v wnba-pulled:/app/wnba_engineering/etl/pulled_data \
#     -v wnba-transformed:/app/wnba_engineering/etl/transformed_data \
#     wnba-etl execute --season 2026

FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1

WORKDIR /app

# dependências primeiro: a camada só é refeita quando o pyproject muda
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -r pyproject.toml

COPY main.py ./
COPY wnba_engineering ./wnba_engineering

ENTRYPOINT ["python", "main.py"]
CMD ["execute"]

FROM postgres@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0
LABEL mfp.fixture="database-readiness" mfp.pgbouncer-package="1.25.2-1.pgdg12+1"
RUN apt-get update -qq && apt-get install -y --no-install-recommends pgbouncer=1.25.2-1.pgdg12+1 \
    && dpkg-query -W postgresql-17 pgbouncer \
    && rm -rf /var/lib/apt/lists/*

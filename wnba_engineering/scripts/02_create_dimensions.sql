-- 02 · dimension tables: one row per arena, team and player

CREATE TABLE IF NOT EXISTS wnba.venue (
    venue_id        integer PRIMARY KEY,
    name            text    NOT NULL,
    city            text,
    state           text,
    is_indoor       boolean
);

CREATE TABLE IF NOT EXISTS wnba.team (
    team_id             integer PRIMARY KEY,
    uid                 text,
    location            text,
    name                text    NOT NULL,
    abbreviation        text    NOT NULL,
    display_name        text    NOT NULL,
    short_display_name  text,
    color               text,
    alternate_color     text,
    is_active           boolean,
    -- no FK to venue: ESPN keeps some teams' old arena ids, which are not in wnba.venue
    venue_id            integer,
    logo                text,
    logo_dark           text
);

CREATE TABLE IF NOT EXISTS wnba.player (
    player_id               integer PRIMARY KEY,
    display_name            text    NOT NULL,
    short_name              text,
    position                text,
    position_abbreviation   text,
    headshot                text
);

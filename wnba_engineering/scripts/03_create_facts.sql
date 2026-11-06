-- 03 · fact tables: games, points per period and box scores

CREATE TABLE IF NOT EXISTS wnba.games (
    game_id                 integer PRIMARY KEY,
    season                  integer     NOT NULL,
    season_type             integer     NOT NULL,   -- 2 = regular season, 3 = playoffs
    game_type               text        NOT NULL,   -- STD, CC, RD16, SEMI, FINAL
    game_type_name          text        NOT NULL,
    game_note               text,
    is_commissioners_cup    boolean     NOT NULL,
    game_date               date        NOT NULL,
    game_date_time          timestamptz NOT NULL,
    game_status             text        NOT NULL,
    is_completed            boolean     NOT NULL,
    num_periods             integer,
    venue_id                integer     REFERENCES wnba.venue (venue_id),
    neutral_site            boolean,
    attendance              integer,
    home_team_id            integer     NOT NULL REFERENCES wnba.team (team_id),
    away_team_id            integer     NOT NULL REFERENCES wnba.team (team_id),
    home_score              integer,
    away_score              integer,
    home_winner             boolean,               -- null while the game is not finished
    -- team records AFTER this game
    home_overall_wins       integer,
    home_overall_losses     integer,
    home_home_wins          integer,
    home_home_losses        integer,
    home_road_wins          integer,
    home_road_losses        integer,
    away_overall_wins       integer,
    away_overall_losses     integer,
    away_home_wins          integer,
    away_home_losses        integer,
    away_road_wins          integer,
    away_road_losses        integer
);

CREATE TABLE IF NOT EXISTS wnba.linescore (
    game_id         integer NOT NULL REFERENCES wnba.games (game_id),
    period          integer NOT NULL,   -- 1-4 quarters, 5+ overtimes
    home_points     integer NOT NULL,
    away_points     integer NOT NULL,
    is_overtime     boolean NOT NULL,
    PRIMARY KEY (game_id, period)
);

CREATE TABLE IF NOT EXISTS wnba.team_box (
    game_id                             integer NOT NULL REFERENCES wnba.games (game_id),
    team_id                             integer NOT NULL REFERENCES wnba.team (team_id),
    opponent_team_id                    integer NOT NULL REFERENCES wnba.team (team_id),
    assists                             integer,
    blocks                              integer,
    defensive_rebounds                  integer,
    fast_break_points                   integer,
    field_goal_pct                      double precision,
    field_goals_made                    integer,
    field_goals_attempted               integer,
    flagrant_fouls                      integer,
    fouls                               integer,
    free_throw_pct                      double precision,
    free_throws_made                    integer,
    free_throws_attempted               integer,
    largest_lead                        integer,
    lead_changes                        integer,
    lead_percentage                     integer,
    offensive_rebounds                  integer,
    points_in_paint                     integer,
    steals                              integer,
    team_turnovers                      integer,
    technical_fouls                     integer,
    three_point_field_goal_pct          double precision,
    three_point_field_goals_made        integer,
    three_point_field_goals_attempted   integer,
    total_rebounds                      integer,
    total_turnovers                     integer,   -- = turnovers + team_turnovers
    turnover_points                     integer,
    turnovers                           integer,
    PRIMARY KEY (game_id, team_id)
);

CREATE TABLE IF NOT EXISTS wnba.player_box (
    game_id                             integer NOT NULL REFERENCES wnba.games (game_id),
    player_id                           integer NOT NULL REFERENCES wnba.player (player_id),
    team_id                             integer NOT NULL REFERENCES wnba.team (team_id),
    opponent_team_id                    integer NOT NULL REFERENCES wnba.team (team_id),
    jersey                              text,      -- can change between games (trades)
    starter                             boolean,
    active                              boolean,
    did_not_play                        boolean,
    reason                              text,      -- why the player did not play
    ejected                             boolean,
    minutes                             double precision,
    points                              integer,
    field_goals_made                    integer,
    field_goals_attempted               integer,
    three_point_field_goals_made        integer,
    three_point_field_goals_attempted   integer,
    free_throws_made                    integer,
    free_throws_attempted               integer,
    offensive_rebounds                  integer,
    defensive_rebounds                  integer,
    rebounds                            integer,
    assists                             integer,
    steals                              integer,
    blocks                              integer,
    turnovers                           integer,
    fouls                               integer,
    plus_minus                          text,      -- comes as text from the source, e.g. "+5"
    PRIMARY KEY (game_id, player_id)
);

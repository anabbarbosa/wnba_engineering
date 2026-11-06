-- 04 · indexes on the columns used in joins and filters
-- (primary keys are already indexed)

CREATE INDEX IF NOT EXISTS games_season_idx       ON wnba.games (season);
CREATE INDEX IF NOT EXISTS games_date_idx         ON wnba.games (game_date);
CREATE INDEX IF NOT EXISTS games_home_team_idx    ON wnba.games (home_team_id);
CREATE INDEX IF NOT EXISTS games_away_team_idx    ON wnba.games (away_team_id);

CREATE INDEX IF NOT EXISTS team_box_team_idx      ON wnba.team_box (team_id);

CREATE INDEX IF NOT EXISTS player_box_player_idx  ON wnba.player_box (player_id);
CREATE INDEX IF NOT EXISTS player_box_team_idx    ON wnba.player_box (team_id);

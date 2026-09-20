-- MySQL / MariaDB. The `code` database is created by kubuno-db's `ensure_schema`
-- before the migrator runs, so there is no CREATE DATABASE here.
--
-- Differences from the PostgreSQL file, and why:
--   * UUID    -> BINARY(16): what sqlx encodes a `uuid::Uuid` as on MySQL.
--   * No DEFAULT on `id`: MySQL has no uuid_generate_v4(), and the process has
--     to know the key anyway since MySQL has no RETURNING (it is generated with
--     kubuno_db::new_id() and bound explicitly).
--   * TIMESTAMPTZ -> DATETIME(6): MySQL has no time zone in the column; every
--     value written is UTC, as produced by chrono and by the +00:00 session.
--   * JSONB -> JSON; the application always binds the value, so no DEFAULT.
--   * `path` is part of a UNIQUE key, and MySQL cannot index a TEXT without a
--     prefix length, so it is VARCHAR here (a project path is far shorter).

CREATE TABLE code.projects (
    id             BINARY(16)   NOT NULL PRIMARY KEY,
    user_id        BINARY(16)   NOT NULL,
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    path           VARCHAR(700) NOT NULL,
    language       VARCHAR(50),
    git_remote     TEXT,
    last_opened_at DATETIME(6),
    created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE (user_id, path)
);

CREATE INDEX idx_code_projects_user    ON code.projects (user_id);
CREATE INDEX idx_code_projects_updated ON code.projects (updated_at);

CREATE TABLE code.editor_sessions (
    id           BINARY(16)  NOT NULL PRIMARY KEY,
    project_id   BINARY(16)  NOT NULL,
    user_id      BINARY(16)  NOT NULL,
    file_path    TEXT        NOT NULL,
    started_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_code_sessions_project
        FOREIGN KEY (project_id) REFERENCES code.projects (id) ON DELETE CASCADE
);

CREATE INDEX idx_code_sessions_project ON code.editor_sessions (project_id);
CREATE INDEX idx_code_sessions_user    ON code.editor_sessions (user_id);

CREATE TABLE code.user_settings (
    user_id    BINARY(16)  NOT NULL PRIMARY KEY,
    settings   JSON        NOT NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                           ON UPDATE CURRENT_TIMESTAMP(6)
);

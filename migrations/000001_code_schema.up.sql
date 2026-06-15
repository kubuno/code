CREATE SCHEMA IF NOT EXISTS code;

-- Projets (répertoires de code ouverts par les utilisateurs)
CREATE TABLE code.projects (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    -- Chemin absolu sur le serveur (sous projects_root/<user_id>/<name>)
    path         TEXT NOT NULL,
    language     VARCHAR(50),                -- langage détecté automatiquement
    -- Métadonnées Git
    git_remote   TEXT,                       -- URL du dépôt distant
    -- Dernière activité
    last_opened_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, path)
);

CREATE INDEX idx_code_projects_user ON code.projects(user_id);
CREATE INDEX idx_code_projects_updated ON code.projects(updated_at DESC);

-- Sessions d'édition actives (pour la collaboration)
CREATE TABLE code.editor_sessions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id   UUID NOT NULL REFERENCES code.projects(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL,
    file_path    TEXT NOT NULL,             -- chemin relatif au projet
    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_code_sessions_project ON code.editor_sessions(project_id);
CREATE INDEX idx_code_sessions_user    ON code.editor_sessions(user_id);

-- Paramètres utilisateur de l'éditeur
CREATE TABLE code.user_settings (
    user_id      UUID PRIMARY KEY,
    settings     JSONB NOT NULL DEFAULT '{}',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extensions installées par les utilisateurs (depuis Open VSX ou upload)
CREATE TABLE code.extensions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL,
    publisher    VARCHAR(100) NOT NULL,
    name         VARCHAR(100) NOT NULL,
    version      VARCHAR(50)  NOT NULL,
    display_name VARCHAR(255),
    description  TEXT,
    -- Chemin vers le répertoire extrait de l'extension
    install_path TEXT NOT NULL,
    -- Manifest de l'extension (package.json)
    manifest     JSONB NOT NULL DEFAULT '{}',
    is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, publisher, name)
);

CREATE INDEX idx_code_ext_user ON code.extensions(user_id);

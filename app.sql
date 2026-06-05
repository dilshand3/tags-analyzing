CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT        NOT NULL,
    description TEXT        NOT NULL,
    createdat   DATE        NOT NULL DEFAULT CURRENT_DATE,
    tags        JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_documents_tags_gin
ON documents
USING GIN(tags);

DROP INDEX IF EXISTS idx_documents_tags_gin;

CREATE INDEX IF NOT EXISTS idx_documents_tags_gin
ON documents
USING GIN(tags jsonb_path_ops);
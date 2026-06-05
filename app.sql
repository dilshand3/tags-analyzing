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


-- seprate tags table method

CREATE TABLE IF NOT EXISTS short_videos (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    created_at   DATE    NOT NULL DEFAULT CURRENT_DATE
);


CREATE TABLE IF NOT EXISTS tags (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT    NOT NULL,
    slug        TEXT    NOT NULL,
    tag_type    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS content_tags (
    content_id  UUID NOT NULL REFERENCES short_videos(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (content_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_tags_name_trgm
ON tags
USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_content_tags_tag_id
ON content_tags (tag_id, content_id);
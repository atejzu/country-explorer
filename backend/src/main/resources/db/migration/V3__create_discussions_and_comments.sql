CREATE TABLE discussions (
    id UUID NOT NULL,
    author_id UUID NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    title VARCHAR(150) NOT NULL,
    body TEXT NOT NULL,
    has_received_comments BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_discussions PRIMARY KEY (id),
    CONSTRAINT fk_discussions_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT ck_discussions_country_code CHECK (country_code ~ '^[A-Z]{3}$')
);

CREATE INDEX ix_discussions_country_created ON discussions (country_code, created_at DESC);
CREATE INDEX ix_discussions_author ON discussions (author_id);

CREATE TABLE comments (
    id UUID NOT NULL,
    discussion_id UUID NOT NULL,
    author_id UUID NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_comments PRIMARY KEY (id),
    CONSTRAINT fk_comments_discussion FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX ix_comments_discussion_created ON comments (discussion_id, created_at ASC);
CREATE INDEX ix_comments_author ON comments (author_id);

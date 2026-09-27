CREATE TABLE favorite_countries (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    country_code VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT pk_favorite_countries PRIMARY KEY (id),
    CONSTRAINT fk_favorite_countries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT ux_favorite_countries_user_country UNIQUE (user_id, country_code),
    CONSTRAINT ck_favorite_countries_country_code CHECK (country_code ~ '^[A-Z]{3}$')
);

-- Explicit owner index follows the domain model; the unique index guards concurrent adds.
CREATE INDEX ix_favorite_countries_user ON favorite_countries (user_id);

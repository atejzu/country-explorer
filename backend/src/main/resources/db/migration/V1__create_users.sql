CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(30) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX ux_users_username_lower ON users (LOWER(username));
CREATE UNIQUE INDEX ux_users_email_lower ON users (LOWER(email));

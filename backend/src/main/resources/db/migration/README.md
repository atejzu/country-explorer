Flyway owns schema changes and runs at application startup; Hibernate validates the result.

V1 creates only the users table and its case-insensitive username/email unique indexes.
Applied migrations are immutable. Future domain tables require separate migrations.

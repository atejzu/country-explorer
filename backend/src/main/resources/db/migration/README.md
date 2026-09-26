Flyway owns schema changes and runs at application startup.

Phase 1 intentionally has no SQL migrations or application tables. Flyway may
create its own schema history table. `V1__initial_schema.sql` is reserved for the
persistence/domain phase; do not add an empty V1 or baseline migration here.

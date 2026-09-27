package si.atejzu.countryexplorer;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.*;

@Testcontainers
class FlywayFavoritesMigrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
    private JdbcTemplate jdbc;
    private Flyway flyway;

    @BeforeEach
    void resetDisposableDatabase() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
        flyway = migrations("2");
        flyway.clean();
    }

    @Test
    void freshDatabaseAppliesBothMigrationsAndValidatesWithoutFurtherChanges() {
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2);
        flyway.validate();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname='public'", String.class))
                .containsExactlyInAnyOrder("users", "favorite_countries", "flyway_schema_history");
    }

    @Test
    void upgradesV1WithoutChangingExistingUserOrV1Checksum() {
        assertThat(migrations("1").migrate().migrationsExecuted).isEqualTo(1);
        UUID user = insertUser();
        var before = jdbc.queryForMap("select * from users where id=?", user);
        Integer checksum = jdbc.queryForObject("select checksum from flyway_schema_history where version='1'", Integer.class);
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForMap("select * from users where id=?", user)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select checksum from flyway_schema_history where version='1'", Integer.class))
                .isEqualTo(checksum);
        insert(UUID.randomUUID(), user, "SVN", Timestamp.from(Instant.now()));
        flyway.validate();
    }

    @Test
    void schemaHasOnlyFourRequiredColumnsAndExplicitOwnerAndUniqueIndexes() {
        flyway.migrate();
        var columns = jdbc.queryForList("""
                select column_name, data_type, character_maximum_length, is_nullable
                from information_schema.columns where table_schema='public' and table_name='favorite_countries'
                """);
        assertThat(columns).hasSize(4);
        var types = Map.of("id", "uuid", "user_id", "uuid", "country_code", "character varying",
                "created_at", "timestamp with time zone");
        for (var column : columns) {
            assertThat(column.get("is_nullable")).isEqualTo("NO");
            assertThat(column.get("data_type")).isEqualTo(types.get(column.get("column_name")));
            if (column.get("column_name").equals("country_code")) {
                assertThat(column.get("character_maximum_length")).isEqualTo(3);
            }
        }
        var indexes = jdbc.queryForList("select indexdef from pg_indexes where tablename='favorite_countries'", String.class);
        assertThat(indexes).anyMatch(index -> index.contains("ix_favorite_countries_user") && index.endsWith("(user_id)"))
                .anyMatch(index -> index.contains("UNIQUE INDEX ux_favorite_countries_user_country")
                        && index.endsWith("(user_id, country_code)"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"id", "user_id", "country_code", "created_at"})
    void requiredColumnsRejectNull(String field) {
        flyway.migrate();
        UUID user = insertUser();
        assertThatThrownBy(() -> insert(field.equals("id") ? null : UUID.randomUUID(),
                field.equals("user_id") ? null : user, field.equals("country_code") ? null : "SVN",
                field.equals("created_at") ? null : Timestamp.from(Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"svn", "Svn", "SI", "SVNN", "12A", "S N", "", "ŠVN", "ſVN"})
    void databaseRejectsMalformedCodesWhenApplicationIsBypassed(String code) {
        flyway.migrate();
        UUID user = insertUser();
        assertThatThrownBy(() -> insert(UUID.randomUUID(), user, code, Timestamp.from(Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void primaryKeyForeignKeyAndDomainUniquenessAreEnforced() {
        flyway.migrate();
        UUID user = insertUser();
        UUID id = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        insert(id, user, "SVN", now);
        assertThatThrownBy(() -> insert(id, user, "ITA", now)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insert(UUID.randomUUID(), UUID.randomUUID(), "SVN", now))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insert(UUID.randomUUID(), user, "SVN", now))
                .isInstanceOf(DataIntegrityViolationException.class);
        insert(UUID.randomUUID(), insertUser(), "SVN", now);
        assertThat(jdbc.queryForObject("select count(*) from favorite_countries", Long.class)).isEqualTo(2);
    }

    @Test
    void deletingUserCascadesOnlyTheirFavorites() {
        flyway.migrate();
        UUID first = insertUser();
        UUID second = insertUser();
        var now = Timestamp.from(Instant.now());
        insert(UUID.randomUUID(), first, "SVN", now);
        insert(UUID.randomUUID(), first, "ITA", now);
        insert(UUID.randomUUID(), second, "SVN", now);
        jdbc.update("delete from users where id=?", first);
        assertThat(jdbc.queryForList("select user_id from favorite_countries", UUID.class)).containsExactly(second);
    }

    private Flyway migrations(String target) {
        var config = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").cleanDisabled(false);
        if (target != null) config.target(target);
        return config.load();
    }

    private UUID insertUser() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into users values (?, ?, ?, ?, ?, ?)", id,
                id.toString().substring(0, 20), id + "@example.test", "test-hash",
                Timestamp.from(Instant.now()), Timestamp.from(Instant.now()));
        return id;
    }

    private void insert(UUID id, UUID user, String code, Timestamp time) {
        jdbc.update("insert into favorite_countries (id, user_id, country_code, created_at) values (?, ?, ?, ?)",
                id, user, code, time);
    }
}

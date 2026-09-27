package si.atejzu.countryexplorer;

import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import static org.assertj.core.api.Assertions.*;

@Testcontainers
class FlywayCommunityMigrationTest {
    @Container static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");
    JdbcTemplate jdbc;
    Flyway flyway;

    @BeforeEach
    void reset() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
        flyway = migrations(null);
        flyway.clean();
    }

    @Test
    void freshDatabaseAppliesAllThreeImmutableMigrations() {
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(3);
        flyway.validate();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForList("select tablename from pg_tables where schemaname='public'", String.class))
                .containsExactlyInAnyOrder("users", "favorite_countries", "discussions", "comments", "flyway_schema_history");
    }

    @Test
    void upgradeFromV2PreservesUsersFavoritesAndChecksums() {
        assertThat(migrations("2").migrate().migrationsExecuted).isEqualTo(2);
        UUID user = user();
        jdbc.update("insert into favorite_countries values (?, ?, 'SVN', now())", UUID.randomUUID(), user);
        var users = jdbc.queryForList("select * from users");
        var favorites = jdbc.queryForList("select * from favorite_countries");
        var checksums = jdbc.queryForList("select version, checksum from flyway_schema_history order by installed_rank");
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(jdbc.queryForList("select * from users")).isEqualTo(users);
        assertThat(jdbc.queryForList("select * from favorite_countries")).isEqualTo(favorites);
        assertThat(jdbc.queryForList("select version, checksum from flyway_schema_history where version in ('1','2') order by installed_rank")).isEqualTo(checksums);
        flyway.validate();
    }

    @Test
    void columnsTypesDefaultsAndOnlySpecifiedIndexesExist() {
        flyway.migrate();
        for (String table : new String[] {"discussions", "comments"}) {
            var columns = jdbc.queryForList("""
                    select column_name, data_type, is_nullable, character_maximum_length from information_schema.columns
                    where table_schema='public' and table_name=?
                    """, table);
            var types = table.equals("discussions") ? Map.of("id", "uuid", "author_id", "uuid", "country_code", "character varying",
                    "title", "character varying", "body", "text", "has_received_comments", "boolean", "created_at", "timestamp with time zone", "updated_at", "timestamp with time zone")
                    : Map.of("id", "uuid", "author_id", "uuid", "discussion_id", "uuid", "body", "text", "created_at", "timestamp with time zone", "updated_at", "timestamp with time zone");
            assertThat(columns).hasSize(types.size());
            for (var column : columns) {
                assertThat(column.get("data_type")).isEqualTo(types.get(column.get("column_name")));
                assertThat(column.get("is_nullable")).isEqualTo("NO");
                if (column.get("column_name").equals("title")) assertThat(column.get("character_maximum_length")).isEqualTo(150);
                if (column.get("column_name").equals("country_code")) assertThat(column.get("character_maximum_length")).isEqualTo(3);
            }
            assertThat(jdbc.queryForObject("select count(*) from pg_indexes where schemaname='public' and tablename=?", Long.class, table)).isEqualTo(3);
        }
        var indexes = jdbc.queryForList("select indexdef from pg_indexes where tablename in ('discussions','comments')", String.class);
        assertThat(indexes).anyMatch(s -> s.contains("ix_discussions_country_created") && s.endsWith("(country_code, created_at DESC)"))
                .anyMatch(s -> s.contains("ix_discussions_author") && s.endsWith("(author_id)"))
                .anyMatch(s -> s.contains("ix_comments_discussion_created") && s.endsWith("(discussion_id, created_at)"))
                .anyMatch(s -> s.contains("ix_comments_author") && s.endsWith("(author_id)"));
        UUID id = discussion(user(), "SVN");
        assertThat(jdbc.queryForObject("select has_received_comments from discussions where id=?", Boolean.class, id)).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"discussions,id", "discussions,author_id", "discussions,country_code", "discussions,title", "discussions,body",
            "discussions,has_received_comments", "discussions,created_at", "discussions,updated_at", "comments,id", "comments,discussion_id",
            "comments,author_id", "comments,body", "comments,created_at", "comments,updated_at"})
    void everyRequiredColumnRejectsNull(String table, String column) {
        flyway.migrate();
        UUID user = user();
        UUID discussion = discussion(user, "SVN");
        comment(discussion, user);
        // Table/column names come only from the closed test cases above.
        assertThatThrownBy(() -> jdbc.update("update " + table + " set " + column + "=null"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"svn", "Svn", "SI", "SVNN", "12A", "S N", "", "ŠVN", "ſVN"})
    void databaseCountryFormatConstraintIsAuthoritative(String code) {
        flyway.migrate();
        UUID user = user();
        assertThatThrownBy(() -> discussion(user, code)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void keysRestrictUsersAndCascadeDiscussionComments() {
        flyway.migrate();
        UUID author = user();
        UUID commenter = user();
        UUID id = discussion(author, "SVN");
        UUID cid = comment(id, commenter);
        assertThatThrownBy(() -> jdbc.update("insert into discussions select * from discussions where id=?", id)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("insert into comments select * from comments where id=?", cid)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> discussion(UUID.randomUUID(), "SVN")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> comment(UUID.randomUUID(), commenter)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> comment(id, UUID.randomUUID())).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("delete from users where id=?", author)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("delete from users where id=?", commenter)).isInstanceOf(DataIntegrityViolationException.class);
        UUID other = discussion(author, "SVN");
        UUID retained = comment(other, commenter);
        jdbc.update("delete from discussions where id=?", id);
        assertThat(jdbc.queryForList("select id from comments", UUID.class)).containsExactly(retained);
        var actions = jdbc.queryForList("select conname, confdeltype::text as action from pg_constraint where conname in ('fk_discussions_author','fk_comments_author','fk_comments_discussion')");
        assertThat(actions).hasSize(3).allSatisfy(action -> assertThat(action.get("action"))
                .isEqualTo(action.get("conname").equals("fk_comments_discussion") ? "c" : "r"));
    }

    private Flyway migrations(String target) {
        var config = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").cleanDisabled(false);
        if (target != null) config.target(target);
        return config.load();
    }
    private UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into users values (?, ?, ?, 'test-hash', now(), now())", id, id.toString().substring(0, 20), id + "@example.test");
        return id;
    }
    private UUID discussion(UUID author, String code) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into discussions (id,author_id,country_code,title,body,created_at,updated_at) values (?, ?, ?, 'Title', 'Body', now(), now())", id, author, code);
        return id;
    }
    private UUID comment(UUID discussion, UUID author) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into comments values (?, ?, ?, 'Body', now(), now())", id, discussion, author);
        return id;
    }
}

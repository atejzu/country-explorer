package si.atejzu.countryexplorer;

import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class FlywayUsersMigrationTest {
    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    @Test
    void v1AppliesOverAnExistingEmptyFlywayHistoryAndIsThenUnchanged() throws Exception {
        var empty = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:empty-migrations").load();
        assertThat(empty.migrate().migrationsExecuted).isZero();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement();
             var result = statement.executeQuery("select count(*) from flyway_schema_history where installed_rank > 0")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isZero();
        }
        var current = Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").load();
        assertThat(current.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(current.migrate().migrationsExecuted).isZero();
        current.validate();
    }
}

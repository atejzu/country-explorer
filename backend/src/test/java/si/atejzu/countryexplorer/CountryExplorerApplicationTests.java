package si.atejzu.countryexplorer;

import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(useMainMethod = SpringBootTest.UseMainMethod.ALWAYS, properties = "app.rest-countries.api-key=")
@AutoConfigureMockMvc
class CountryExplorerApplicationTests {

    @Autowired
    MockMvc mvc;

    @Autowired
    SecurityFilterChain securityFilterChain;

    @Autowired
    Flyway flyway;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void healthIsPublicAndDoesNotExposeDetails() throws Exception {
        mvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}", JsonCompareMode.STRICT));
    }

    @Test
    void flywayCreatesUsersAndHibernateValidatesTheSchema() {
        assertThat(flyway.info().applied()).hasSize(1);
        assertThat(flyway.info().applied()[0].getVersion().getVersion()).isEqualTo("1");
        assertThat(flyway.info().pending()).isEmpty();
        List<String> tables = jdbc.queryForList(
                "select tablename from pg_tables where schemaname = 'public'", String.class);
        assertThat(tables).containsExactlyInAnyOrder("flyway_schema_history", "users");
    }

    @Test
    void otherEndpointsAreNotPublic() throws Exception {
        for (String path : List.of("/actuator", "/actuator/env", "/login")) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void missingCountryKeyDoesNotPreventStartupAndCountryRequestsFailCleanly() throws Exception {
        for (String path : List.of("/api/v1/countries", "/api/v1/countries/SVN")) {
            mvc.perform(get(path)).andExpect(status().isServiceUnavailable())
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                            .value("COUNTRY_SERVICE_UNAVAILABLE"));
        }
    }

    @Test
    void securityFilterChainIncludesCsrfProtection() {
        assertThat(securityFilterChain.getFilters())
                .anyMatch(CsrfFilter.class::isInstance);
    }
}

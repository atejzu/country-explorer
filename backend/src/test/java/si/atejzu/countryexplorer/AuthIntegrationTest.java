package si.atejzu.countryexplorer;

import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.ui.DefaultLoginPageGeneratingFilter;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultMatcher;
import tools.jackson.databind.ObjectMapper;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;
import si.atejzu.countryexplorer.common.security.JsonLoginAuthenticationFilter;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.rest-countries.api-key=")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class AuthIntegrationTest {
    private static final String PASSWORD = "testpassword";
    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @MockitoSpyBean PasswordEncoder passwords;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired SecurityFilterChain chain;

    @BeforeEach
    void cleanUsers() { users.deleteAll(); }

    @Test
    void registrationPersistsOnlyHashAndDoesNotAuthenticate() throws Exception {
        var token = csrfCookie(null);
        var session = new MockHttpSession();
        var result = mvc.perform(post("/api/v1/auth/register").session(session).cookie(token)
                        .header("X-XSRF-TOKEN", token.getValue()).contentType("application/json")
                        .content(registration("Marko", "User@example.com", PASSWORD)))
                .andExpect(status().isCreated()).andReturn();
        var stored = users.findByEmailIgnoreCase("USER@EXAMPLE.COM").orElseThrow();
        assertThat(stored.getId()).isNotNull();
        assertThat(stored.getPasswordHash()).isNotEqualTo(PASSWORD).startsWith("{pbkdf2@SpringSecurity_v5_8}");
        assertThat(passwords.matches(PASSWORD, stored.getPasswordHash())).isTrue();
        assertThat(stored.getCreatedAt()).isBeforeOrEqualTo(Instant.now());
        assertThat(stored.getUpdatedAt()).isEqualTo(stored.getCreatedAt());
        assertThat(users.existsByUsernameIgnoreCase("MARKO")).isTrue();
        assertThat(users.existsByEmailIgnoreCase("USER@EXAMPLE.COM")).isTrue();
        var response = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(response.propertyNames()).containsExactlyInAnyOrder("id", "username", "email", "createdAt");
        assertThat(response.path("id").asString()).isEqualTo(stored.getId().toString());
        assertThat(response.path("username").asString()).isEqualTo("Marko");
        assertThat(response.path("email").asString()).isEqualTo("User@example.com");
        mvc.perform(get("/api/v1/users/me").session(session)).andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"USERNAME", "EMAIL"})
    void existingCaseInsensitiveConflictsReturn409(String field) throws Exception {
        register("Marko", "User@example.com");
        var token = csrfCookie(null);
        String username = field.equals("USERNAME") ? "marko" : "other";
        String email = field.equals("EMAIL") ? "user@EXAMPLE.com" : "other@example.com";
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration(username, email, PASSWORD)))
                .andExpect(problem(409, field + "_ALREADY_EXISTS"));
        assertThat(users.count()).isEqualTo(1);
    }

    @Test
    void existingUsernameConflictTakesPrecedenceWhenBothFieldsConflict() throws Exception {
        register("Marko", "first@example.com");
        register("Other", "second@example.com");
        var token = csrfCookie(null);
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration("MARKO", "SECOND@example.com", PASSWORD)))
                .andExpect(problem(409, "USERNAME_ALREADY_EXISTS"));
        assertThat(users.count()).isEqualTo(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"USERNAME", "EMAIL", "BOTH"})
    void simultaneousRegistrationsProduceOneCreatedAndOneStableConflict(String field) throws Exception {
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var passedPrechecks = new CountDownLatch(2);
        // Force both transactions past the pre-checks before either can insert.
        // The loser must therefore exercise PostgreSQL constraint translation.
        doAnswer(invocation -> {
            passedPrechecks.countDown();
            assertThat(passedPrechecks.await(10, TimeUnit.SECONDS)).isTrue();
            return invocation.callRealMethod();
        }).when(passwords).encode(any(CharSequence.class));
        try (var executor = Executors.newFixedThreadPool(2)) {
            var jobs = Stream.of(0, 1).map(index -> executor.submit(() -> {
                var token = csrfCookie(null);
                ready.countDown();
                assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                String username = !field.equals("EMAIL") ? (index == 0 ? "RaceUser" : "raceuser") : "racer" + index;
                String email = !field.equals("USERNAME") ? (index == 0 ? "Race@example.com" : "race@EXAMPLE.com")
                        : "racer" + index + "@example.com";
                return mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration(username, email, PASSWORD))).andReturn();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var first = jobs.get(0).get(20, TimeUnit.SECONDS);
            var second = jobs.get(1).get(20, TimeUnit.SECONDS);
            assertThat(List.of(first.getResponse().getStatus(), second.getResponse().getStatus()))
                    .containsExactlyInAnyOrder(201, 409);
            var conflict = first.getResponse().getStatus() == 409 ? first : second;
            String code = mapper.readTree(conflict.getResponse().getContentAsString()).path("code").asString();
            if (field.equals("BOTH")) {
                assertThat(code).isIn("USERNAME_ALREADY_EXISTS", "EMAIL_ALREADY_EXISTS");
            } else {
                assertThat(code).isEqualTo(field + "_ALREADY_EXISTS");
            }
            problem(409, code).match(conflict);
            assertThat(users.count()).isEqualTo(1);
        }
    }

    static Stream<Arguments> invalidRegistration() {
        return Stream.of(
                Arguments.of("username", null), Arguments.of("username", ""), Arguments.of("username", "ab"),
                Arguments.of("username", "u".repeat(31)), Arguments.of("email", null),
                Arguments.of("email", "not-an-email"), Arguments.of("email", "a".repeat(243) + "@example.com"),
                Arguments.of("password", null), Arguments.of("password", "short"),
                Arguments.of("password", "p".repeat(73)));
    }

    @ParameterizedTest
    @MethodSource("invalidRegistration")
    void validatesRegistrationFields(String field, String value) throws Exception {
        var body = new java.util.HashMap<>(Map.of("username", "validuser", "email", "valid@example.com", "password", PASSWORD));
        if (value == null) body.remove(field); else body.put(field, value);
        var token = csrfCookie(null);
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(mapper.writeValueAsString(body)))
                .andExpect(problem(400, "VALIDATION_FAILED"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.detail").value("One or more request fields are invalid."))
                .andExpect(jsonPath("$.fieldErrors[0].field").value(field))
                .andExpect(jsonPath("$.fieldErrors[0].message").isNotEmpty());
        assertThat(users.count()).isZero();
    }

    @ParameterizedTest
    @ValueSource(ints = {8, 72})
    void passwordLengthBoundariesNeedNoCompositionRules(int length) throws Exception {
        var token = csrfCookie(null);
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration("boundary", "boundary@example.com", "a".repeat(length))))
                .andExpect(status().isCreated());
        assertThat(passwords.matches("a".repeat(length), users.findAll().getFirst().getPasswordHash())).isTrue();
        login("boundary@example.com", "a".repeat(length), token, new MockHttpSession()).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(ints = {37, 72})
    void unicodePasswordBeyondOldBcryptByteLimitRegistersAndLogsIn(int length) throws Exception {
        var token = csrfCookie(null);
        String password = "č".repeat(length);
        assertThat(password.length()).isBetween(8, 72);
        assertThat(password.getBytes(StandardCharsets.UTF_8).length).isGreaterThan(72);
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration("unicodeuser", "unicode@example.com", password)))
                .andExpect(status().isCreated());
        var hash = users.findAll().getFirst().getPasswordHash();
        assertThat(hash).isNotEqualTo(password).startsWith("{pbkdf2@SpringSecurity_v5_8}");
        assertThat(passwords.matches(password, hash)).isTrue();
        login("unicode@example.com", password, token, new MockHttpSession()).andExpect(status().isOk());
    }

    @Test
    void unicodePasswordsDifferingAfterOldBcryptBoundaryAreNotEquivalent() throws Exception {
        var token = csrfCookie(null);
        String prefix = "č".repeat(36);
        assertThat(prefix.getBytes(StandardCharsets.UTF_8).length).isEqualTo(72);
        String password = prefix + "a";
        String different = prefix + "b";
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration("unicodeuser", "unicode@example.com", password)))
                .andExpect(status().isCreated());
        login("unicode@example.com", password, token, new MockHttpSession()).andExpect(status().isOk());
        assertThat(passwords.matches(different, users.findAll().getFirst().getPasswordHash())).isFalse();
        login("unicode@example.com", different, token, new MockHttpSession())
                .andExpect(problem(401, "INVALID_CREDENTIALS"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{", "null", "[]", ""})
    void malformedRegistrationIsSanitized(String body) throws Exception {
        var token = csrfCookie(null);
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(body))
                .andExpect(problem(400, "VALIDATION_FAILED")).andExpect(jsonPath("$.fieldErrors").isArray());
    }

    @Test
    void csrfBootstrapMaterializesPlainCookieAndBreachProtectedAttribute() throws Exception {
        var result = mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent())
                .andExpect(content().string("")).andExpect(cookie().httpOnly("XSRF-TOKEN", false)).andReturn();
        var cookie = result.getResponse().getCookie("XSRF-TOKEN");
        assertThat(cookie).isNotNull();
        assertThat(cookie.getValue()).isNotBlank();
        assertThat(cookie.getPath()).isEqualTo("/");
        var attribute = (CsrfToken) result.getRequest().getAttribute(CsrfToken.class.getName());
        assertThat(attribute.getToken()).isNotEqualTo(cookie.getValue());
    }

    @ParameterizedTest
    @ValueSource(strings = {"register", "login", "logout"})
    void missingOrInvalidCsrfIsAlwaysSafe403(String endpoint) throws Exception {
        var token = csrfCookie(null);
        for (String headerValue : List.of("", "invalid")) {
            mvc.perform(post("/api/v1/auth/" + endpoint).cookie(token).header("X-XSRF-TOKEN", headerValue)
                            .contentType("application/json").content("{}"))
                    .andExpect(problem(403, "ACCESS_DENIED"));
        }
    }

    @Test
    void loginRotatesSessionPersistsIdentityAndLogoutClearsIt() throws Exception {
        register("Marko", "User@example.com");
        var stored = users.findAll().getFirst();
        var session = new MockHttpSession();
        String originalId = session.getId();
        var token = csrfCookie(session);
        var result = login("USER@EXAMPLE.COM", PASSWORD, token, session)
                .andExpect(status().isOk())
                .andExpect(content().json(mapper.writeValueAsString(Map.of("user", Map.of(
                        "id", stored.getId(), "username", "Marko", "email", "User@example.com"))), JsonCompareMode.STRICT))
                .andReturn();
        assertThat(session.getId()).isNotEqualTo(originalId);
        assertThat(result.getResponse().getCookie("XSRF-TOKEN").getMaxAge()).isZero();
        var context = (SecurityContext) session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        var principal = (AppUserPrincipal) context.getAuthentication().getPrincipal();
        assertThat(principal.userId()).isEqualTo(stored.getId());
        assertThat(principal.getPassword()).isNull();
        assertThat(context.getAuthentication().getCredentials()).isNull();
        assertThat(principal.getAuthorities()).extracting("authority").containsExactly("ROLE_USER");
        mvc.perform(get("/api/v1/users/me").session(session))
                .andExpect(status().isOk())
                .andExpect(content().json(mapper.writeValueAsString(Map.of("id", stored.getId(), "username", "Marko",
                        "email", "User@example.com", "createdAt", stored.getCreatedAt())), JsonCompareMode.STRICT));
        var fresh = csrfCookie(session);
        assertThat(fresh.getValue()).isNotEqualTo(token.getValue());
        mvc.perform(post("/api/v1/auth/logout").session(session).cookie(fresh)
                        .header("X-XSRF-TOKEN", token.getValue())).andExpect(problem(403, "ACCESS_DENIED"));
        mvc.perform(post("/api/v1/auth/logout").session(session)).andExpect(problem(403, "ACCESS_DENIED"));
        mvc.perform(post("/api/v1/auth/logout").session(session).cookie(fresh).header("X-XSRF-TOKEN", fresh.getValue()))
                .andExpect(status().isNoContent()).andExpect(content().string(""))
                .andExpect(cookie().maxAge("JSESSIONID", 0)).andExpect(cookie().maxAge("XSRF-TOKEN", 0));
        assertThat(session.isInvalid()).isTrue();
        mvc.perform(get("/api/v1/users/me")).andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
        var anonymous = csrfCookie(null);
        assertThat(anonymous.getValue()).isNotEqualTo(fresh.getValue());
        login("user@example.com", PASSWORD, anonymous, new MockHttpSession()).andExpect(status().isOk());
    }

    @Test
    void wrongPasswordAndUnknownEmailHaveIdenticalExternalResponse() throws Exception {
        register("Marko", "User@example.com");
        var token = csrfCookie(null);
        var first = login("User@example.com", "wrong-password", token, new MockHttpSession())
                .andExpect(problem(401, "INVALID_CREDENTIALS")).andReturn();
        var second = login("unknown@example.com", PASSWORD, token, new MockHttpSession())
                .andExpect(problem(401, "INVALID_CREDENTIALS")).andReturn();
        assertThat(first.getResponse().getContentAsString()).isEqualTo(second.getResponse().getContentAsString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "{", "null", "[]", "{}", "{\"email\":\"x@example.com\"}",
            "{\"password\":\"testpassword\"}", "{\"email\":42,\"password\":true}",
            "{\"email\":\"\",\"password\":\"\"}", "{} {}"})
    void malformedLoginNeverAuthenticatesOrLeaksParserDetails(String body) throws Exception {
        var session = new MockHttpSession();
        var token = csrfCookie(session);
        mvc.perform(post("/api/v1/auth/login").session(session).cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(body))
                .andExpect(problem(401, "INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.detail").value("Email or password is incorrect."));
        mvc.perform(get("/api/v1/users/me").session(session)).andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
    }

    @Test
    void anonymousLogoutFailsSafely() throws Exception {
        var token = csrfCookie(null);
        mvc.perform(post("/api/v1/auth/logout").cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"register", "login"})
    void unsupportedMediaTypeThroughSecurityChainHasExactProblemEnvelope(String endpoint) throws Exception {
        var session = new MockHttpSession();
        var token = csrfCookie(session);
        for (String mediaType : List.of("text/plain", "application/x-www-form-urlencoded")) {
            mvc.perform(post("/api/v1/auth/" + endpoint).session(session).cookie(token)
                            .header("X-XSRF-TOKEN", token.getValue()).contentType(mediaType).content("{}"))
                    .andExpect(problem(415, "UNSUPPORTED_MEDIA_TYPE"))
                    .andExpect(content().json(mapper.writeValueAsString(Map.of(
                            "type", "about:blank", "title", "Unsupported media type", "status", 415,
                            "detail", "The request media type is not supported.",
                            "instance", "/api/v1/auth/" + endpoint, "code", "UNSUPPORTED_MEDIA_TYPE")), JsonCompareMode.STRICT));
        }
        mvc.perform(get("/api/v1/users/me").session(session)).andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
        assertThat(users.count()).isZero();
    }

    @Test
    void securityDefaultsDenyFutureRoutesAndDoNotExposeFormOrBasicLogin() throws Exception {
        for (String path : List.of("/api/v1/users/me", "/login", "/api/v1/auth/login", "/api/v1/auth/logout",
                "/api/v1/users/me/favorites", "/api/v1/countries/SVN/discussions", "/api/v1/unknown")) {
            mvc.perform(get(path)).andExpect(problem(401, "AUTHENTICATION_REQUIRED"))
                    .andExpect(header().doesNotExist("Location")).andExpect(header().doesNotExist("WWW-Authenticate"));
        }
        mvc.perform(get("/api/v1/unknown").with(user("testuser")))
                .andExpect(problem(403, "ACCESS_DENIED"));
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Basic dGVzdDp0ZXN0"))
                .andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
        assertThat(chain.getFilters()).anyMatch(JsonLoginAuthenticationFilter.class::isInstance)
                .noneMatch(filter -> filter instanceof BasicAuthenticationFilter
                        || filter instanceof DefaultLoginPageGeneratingFilter
                        || filter instanceof UsernamePasswordAuthenticationFilter);
    }

    @Test
    void schemaHasExpectedTypesLimitsNullabilityAndNamedExpressionIndexes() {
        var types = jdbc.queryForList("""
                select column_name, data_type, character_maximum_length, is_nullable
                from information_schema.columns where table_schema='public' and table_name='users'
                """);
        assertThat(types).hasSize(6);
        for (var column : types) {
            assertThat(column.get("is_nullable")).isEqualTo("NO");
            String name = (String) column.get("column_name");
            if (name.equals("id")) assertThat(column.get("data_type")).isEqualTo("uuid");
            else if (name.endsWith("_at")) assertThat(column.get("data_type")).isEqualTo("timestamp with time zone");
            else {
                assertThat(column.get("data_type")).isEqualTo("character varying");
                assertThat(column.get("character_maximum_length")).isEqualTo(
                        Map.of("username", 30, "email", 254, "password_hash", 255).get(name));
            }
        }
        var indexes = jdbc.queryForList("select indexdef from pg_indexes where tablename='users'", String.class);
        assertThat(indexes).anyMatch(value -> value.contains("UNIQUE INDEX ux_users_username_lower") && value.contains("lower"))
                .anyMatch(value -> value.contains("UNIQUE INDEX ux_users_email_lower") && value.contains("lower"));
    }

    private void register(String username, String email) throws Exception {
        var token = csrfCookie(null);
        mvc.perform(post("/api/v1/auth/register").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType("application/json").content(registration(username, email, PASSWORD)))
                .andExpect(status().isCreated());
    }

    private String registration(String username, String email, String password) {
        return mapper.writeValueAsString(Map.of("username", username, "email", email, "password", password));
    }

    private Cookie csrfCookie(MockHttpSession session) throws Exception {
        var request = get("/api/v1/auth/csrf");
        if (session != null) request.session(session);
        return mvc.perform(request).andExpect(status().isNoContent()).andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String password,
            Cookie token, MockHttpSession session) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").session(session).cookie(token)
                .header("X-XSRF-TOKEN", token.getValue()).contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private static ResultMatcher problem(int statusCode, String code) {
        return result -> {
            status().is(statusCode).match(result);
            content().contentType("application/problem+json").match(result);
            jsonPath("$.type").value("about:blank").match(result);
            jsonPath("$.title").isNotEmpty().match(result);
            jsonPath("$.status").value(statusCode).match(result);
            jsonPath("$.detail").isNotEmpty().match(result);
            jsonPath("$.instance").value(result.getRequest().getRequestURI()).match(result);
            jsonPath("$.code").value(code).match(result);
            assertThat(result.getResponse().getContentAsString()).doesNotContain("passwordHash", "stackTrace", "SQLException");
        };
    }
}

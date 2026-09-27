package si.atejzu.countryexplorer;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;
import si.atejzu.countryexplorer.country.application.CountryService;
import si.atejzu.countryexplorer.favorite.persistence.FavoriteCountryRepository;
import si.atejzu.countryexplorer.user.domain.UserAccount;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
class FavoriteIntegrationTest {
    private static final String PATH = "/api/v1/users/me/favorites";
    private static final ConcurrentLinkedQueue<Reply> replies = new ConcurrentLinkedQueue<>();
    private static final ConcurrentLinkedQueue<URI> requests = new ConcurrentLinkedQueue<>();
    private static final HttpServer server = startServer();
    private static final String CATALOGUE = """
            {"data":{"objects":[
              {"codes":{"alpha_2":"SI","alpha_3":"SVN"},
               "names":{"common":"Slovenia","native":{"slv":{"common":"Slovenija"}}},
               "capitals":[{"name":"Ljubljana"}],"population":2100000,"region":"Europe",
               "flag":{"url_png":"https://example.test/si.png","url_svg":"https://example.test/si.svg"}},
              {"codes":{"alpha_2":"IT","alpha_3":"ITA"},"names":{"common":"Italy"}},
              {"codes":{"alpha_3":"BRA"},"names":{"common":"Brazil"}}
            ],"meta":{"total":3,"count":3,"offset":0,"limit":100,"more":false}}}
            """;

    @Autowired MockMvc mvc;
    @Autowired UserAccountRepository users;
    @Autowired FavoriteCountryRepository favorites;
    @Autowired CacheManager caches;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @MockitoSpyBean CountryService countries;
    private AppUserPrincipal first;
    private AppUserPrincipal second;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.rest-countries.base-url", () -> "http://127.0.0.1:" + server.getAddress().getPort() + "/countries/v5");
        registry.add("app.rest-countries.api-key", () -> "test-only-placeholder");
    }

    @BeforeEach
    void reset() {
        users.deleteAll();
        first = account("first");
        second = account("second");
        replies.clear();
        requests.clear();
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
    }

    @AfterAll
    static void stopServer() { server.stop(0); }

    @ParameterizedTest
    @ValueSource(strings = {"GET", "PUT", "DELETE"})
    void anonymousRequestsRequireAuthentication(String method) throws Exception {
        var token = csrfCookie();
        mvc.perform(request(HttpMethod.valueOf(method), method.equals("GET") ? PATH : PATH + "/SVN")
                        .cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
        assertThat(rowCount()).isZero();
        assertThat(requests).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"PUT", "DELETE"})
    void authenticatedMutationsRequireValidCsrf(String method) throws Exception {
        seed(first, "SVN");
        mvc.perform(request(HttpMethod.valueOf(method), PATH + "/SVN").with(user(first)))
                .andExpect(problem(403, "ACCESS_DENIED"));
        var token = csrfCookie();
        mvc.perform(request(HttpMethod.valueOf(method), PATH + "/SVN").with(user(first))
                        .cookie(token).header("X-XSRF-TOKEN", "invalid"))
                .andExpect(problem(403, "ACCESS_DENIED"));
        assertThat(rowCount()).isEqualTo(1);
        assertThat(requests).isEmpty();
    }

    @Test
    void emptyListNeedsNoUpstream() throws Exception {
        mvc.perform(get(PATH).with(user(first))).andExpect(status().isOk())
                .andExpect(content().json("[]", JsonCompareMode.STRICT));
        assertThat(requests).isEmpty();
    }

    @Test
    void listUsesStoredTimestampAndExactExplorerSummaryContract() throws Exception {
        Instant created = Instant.parse("2026-09-26T11:45:00Z");
        favorites.insertIfAbsent(java.util.UUID.randomUUID(), first.userId(), "SVN", created);
        catalogue();
        mvc.perform(get(PATH).with(user(first))).andExpect(status().isOk())
                .andExpect(content().json("""
                        [{"country":{"code":"SVN","name":"Slovenija","capital":"Ljubljana","population":2100000,
                          "region":"Europe","flag":{"png":"https://example.test/si.png","svg":"https://example.test/si.svg",
                          "alt":"Zastava države Slovenija"}},"favoritedAt":"2026-09-26T11:45:00Z"}]
                        """, JsonCompareMode.STRICT));
        var explorer = mvc.perform(get("/api/v1/countries").param("search", "Slovenia"))
                .andExpect(status().isOk()).andReturn();
        var saved = mvc.perform(get(PATH).with(user(first))).andReturn();
        assertThat(mapper.readTree(saved.getResponse().getContentAsString()).get(0).get("country"))
                .isEqualTo(mapper.readTree(explorer.getResponse().getContentAsString()).get(0));
        assertCatalogueRequests(1);
    }

    @Test
    void listsAreOwnerScopedAndBulkEnrichedFromOneCachedCatalogue() throws Exception {
        seed(first, "SVN");
        seed(first, "ITA");
        seed(second, "BRA");
        catalogue();
        mvc.perform(get(PATH).with(user(first)).param("userId", second.userId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$[*].country.code",
                        org.hamcrest.Matchers.containsInAnyOrder("SVN", "ITA")));
        mvc.perform(get(PATH).with(user(second))).andExpect(status().isOk())
                .andExpect(jsonPath("$[*].country.code", org.hamcrest.Matchers.contains("BRA")));
        assertCatalogueRequests(1);
    }

    @Test
    void countryDataIsEnrichedAgainAfterCacheExpiry() throws Exception {
        seed(first, "SVN");
        catalogue();
        mvc.perform(get(PATH).with(user(first))).andExpect(jsonPath("$[0].country.population").value(2100000));
        caches.getCache("countryCatalog").clear();
        replies.add(new Reply(200, CATALOGUE.replace("2100000", "2200000")));
        mvc.perform(get(PATH).with(user(first))).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].country.population").value(2200000));
        assertCatalogueRequests(2);
        assertThat(rowCount()).isEqualTo(1);
    }

    @Test
    void unavailableCatalogueFailsWholeListWithSafeProblem() throws Exception {
        seed(first, "SVN");
        seed(first, "ITA");
        replies.add(new Reply(503, "private upstream account details"));
        mvc.perform(get(PATH).with(user(first))).andExpect(problem(503, "COUNTRY_SERVICE_UNAVAILABLE"))
                .andExpect(jsonPath("$.detail").value("Country data is temporarily unavailable."));
        assertThat(rowCount()).isEqualTo(2);
        assertCatalogueRequests(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SVN", "svn", "sVn"})
    void addNormalizesAndPersistsOnlyCurrentUser(String code) throws Exception {
        catalogue();
        var token = csrfCookie();
        mvc.perform(put(PATH + "/{code}", code).with(user(first)).cookie(token)
                        .header("X-XSRF-TOKEN", token.getValue()).param("userId", second.userId().toString())
                        .contentType("application/json").content("{\"userId\":\"" + second.userId() + "\"}"))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        assertThat(favorites.findAllByUserId(first.userId())).singleElement().satisfies(saved -> {
            assertThat(saved.getId()).isNotNull();
            assertThat(saved.getUserId()).isEqualTo(first.userId());
            assertThat(saved.getCountryCode()).isEqualTo("SVN");
            assertThat(saved.getCreatedAt()).isBeforeOrEqualTo(Instant.now());
        });
        assertThat(favorites.findAllByUserId(second.userId())).isEmpty();
        assertCatalogueRequests(1);
    }

    @Test
    void repeatedPutPreservesRowAndTimestampEvenIfUpstreamIsUnavailable() throws Exception {
        catalogue();
        mutate("PUT", first, "svn");
        var original = favorites.findAllByUserId(first.userId()).getFirst();
        caches.getCache("countryCatalog").clear();
        mutate("PUT", first, "SVN");
        assertThat(favorites.findAllByUserId(first.userId())).singleElement().satisfies(saved -> {
            assertThat(saved.getId()).isEqualTo(original.getId());
            assertThat(saved.getCreatedAt()).isEqualTo(original.getCreatedAt());
        });
        assertThat(rowCount()).isEqualTo(1);
        assertCatalogueRequests(1);
    }

    @Test
    void nonexistentCodeIs404AndCreatesNothing() throws Exception {
        catalogue();
        failedAdd("ZZZ", 404, "COUNTRY_NOT_FOUND");
        assertCatalogueRequests(1);
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 429, 500, 503})
    void failedValidationIsSafe503AndCreatesNothing(int upstreamStatus) throws Exception {
        replies.add(new Reply(upstreamStatus, "private upstream account details"));
        failedAdd("SVN", 503, "COUNTRY_SERVICE_UNAVAILABLE");
        assertCatalogueRequests(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SI", "123", "Slovenia", "ſvn", "ŠVN"})
    void malformedAddAndDeleteAre404WithoutDatabaseMutationOrUpstream(String code) throws Exception {
        failedAdd(code, 404, "COUNTRY_NOT_FOUND");
        var token = csrfCookie();
        mvc.perform(delete(PATH + "/{code}", code).with(user(first)).cookie(token)
                        .header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(problem(404, "COUNTRY_NOT_FOUND"));
        assertThat(rowCount()).isZero();
        assertThat(requests).isEmpty();
    }

    @Test
    void deleteIsIdempotentCaseInsensitiveAndScopedToOwnerWithoutUpstream() throws Exception {
        seed(first, "SVN");
        seed(first, "ITA");
        seed(second, "SVN");
        mutate("DELETE", first, "svn");
        mutate("DELETE", first, "SVN");
        mutate("DELETE", first, "ZZZ");
        assertThat(favorites.findAllByUserId(first.userId())).extracting("countryCode").containsExactly("ITA");
        assertThat(favorites.findAllByUserId(second.userId())).extracting("countryCode").containsExactly("SVN");
        assertThat(requests).isEmpty();
    }

    @Test
    void catalogueResolutionRunsOutsideDatabaseTransactionsForAddAndList() throws Exception {
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return invocation.callRealMethod();
        }).when(countries).summaries(any());
        catalogue();
        mutate("PUT", first, "SVN");
        mvc.perform(get(PATH).with(user(first))).andExpect(status().isOk());
    }

    @Test
    void concurrentDuplicatePutsBothReturn204AndLeaveExactlyOneRow() throws Exception {
        var passedPrechecks = new CountDownLatch(2);
        // Both requests have observed absence before either can reach the atomic insert.
        doAnswer(invocation -> {
            passedPrechecks.countDown();
            assertThat(passedPrechecks.await(10, TimeUnit.SECONDS)).isTrue();
            return invocation.callRealMethod();
        }).when(countries).summaries(any());
        catalogue();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var jobs = Stream.of("svn", "SVN").map(code -> executor.submit(() -> {
                mutate("PUT", first, code);
                return true;
            })).toList();
            for (var job : jobs) assertThat(job.get(20, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(rowCount()).isEqualTo(1);
        assertThat(favorites.findAllByUserId(first.userId())).extracting("countryCode").containsExactly("SVN");
        assertCatalogueRequests(1);
    }

    private void failedAdd(String code, int statusCode, String error) throws Exception {
        var token = csrfCookie();
        mvc.perform(put(PATH + "/{code}", code).with(user(first)).cookie(token)
                        .header("X-XSRF-TOKEN", token.getValue())).andExpect(problem(statusCode, error));
        assertThat(rowCount()).isZero();
    }

    private void mutate(String method, AppUserPrincipal principal, String code) throws Exception {
        var token = csrfCookie();
        mvc.perform(request(HttpMethod.valueOf(method), PATH + "/{code}", code).with(user(principal))
                        .cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
    }

    private Cookie csrfCookie() throws Exception {
        return mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie("XSRF-TOKEN");
    }

    private AppUserPrincipal account(String name) {
        var saved = users.saveAndFlush(new UserAccount(name, name + "@example.test", "unused-test-hash"));
        return new AppUserPrincipal(saved.getId(), saved.getUsername(), saved.getEmail(), null);
    }

    private void seed(AppUserPrincipal principal, String code) {
        favorites.insertIfAbsent(java.util.UUID.randomUUID(), principal.userId(), code, Instant.now());
    }

    private long rowCount() { return jdbc.queryForObject("select count(*) from favorite_countries", Long.class); }
    private void catalogue() { replies.add(new Reply(200, CATALOGUE)); }

    private void assertCatalogueRequests(int count) {
        assertThat(requests).hasSize(count).allSatisfy(uri -> assertThat(uri.getPath()).isEqualTo("/countries/v5"));
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
            assertThat(result.getResponse().getContentAsString()).doesNotContain(
                    "private upstream", "password", "email", "SQLException", "stackTrace", "constraint", "INSERT");
        };
    }

    private record Reply(int status, String body) {}

    private static HttpServer startServer() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                requests.add(exchange.getRequestURI());
                var reply = replies.poll();
                if (reply == null) reply = new Reply(503, "{}");
                byte[] body = reply.body().getBytes(StandardCharsets.UTF_8);
                try {
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(reply.status(), body.length);
                    exchange.getResponseBody().write(body);
                } finally {
                    exchange.close();
                }
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }
}

package si.atejzu.countryexplorer.country;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.cache.CacheManager;
import org.springframework.cache.Cache;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import si.atejzu.countryexplorer.common.config.CacheConfig;
import si.atejzu.countryexplorer.common.config.SecurityConfig;
import si.atejzu.countryexplorer.common.error.GlobalExceptionHandler;
import si.atejzu.countryexplorer.country.api.CountryApiMapper;
import si.atejzu.countryexplorer.country.api.CountryController;
import si.atejzu.countryexplorer.country.application.CountryService;
import si.atejzu.countryexplorer.country.application.CountryQuery;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesClient;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = CountryController.class, excludeAutoConfiguration =
        org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
@Import({SecurityConfig.class, GlobalExceptionHandler.class, CountryApiMapper.class, CountryService.class,
        CacheConfig.class, RestCountriesClient.class, RestCountriesMapper.class})
class CountryHttpIntegrationTest {
    private static final ConcurrentLinkedQueue<Reply> replies = new ConcurrentLinkedQueue<>();
    private static final ConcurrentLinkedQueue<URI> requests = new ConcurrentLinkedQueue<>();
    private static final ConcurrentLinkedQueue<String> authorizations = new ConcurrentLinkedQueue<>();
    private static final java.util.concurrent.ExecutorService executor = Executors.newCachedThreadPool();
    private static final HttpServer server = startServer();

    @Autowired MockMvc mvc;
    @Autowired CacheManager caches;
    @Autowired RestCountriesClient client;
    @MockitoSpyBean CountryService service;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.rest-countries.base-url", () -> "http://127.0.0.1:" + server.getAddress().getPort() + "/countries/v5");
        registry.add("app.rest-countries.api-key", () -> "test-only-placeholder");
        registry.add("app.rest-countries.read-timeout", () -> "2s");
    }

    @BeforeEach
    void reset() {
        replies.clear();
        requests.clear();
        authorizations.clear();
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
    }

    @AfterAll
    static void stopServer() {
        server.stop(0);
        executor.shutdownNow();
    }

    @Test
    void publicCatalogueCombinesPagesSkipsInvalidCodesAndCachesCompleteResult() throws Exception {
        replies.add(new Reply(200, CountryFixtures.page(CountryFixtures.SLOVENIA, 3, 1, 0, true), 0));
        replies.add(new Reply(200, CountryFixtures.page("""
                {"codes":{"alpha_3":"ATA"},"names":{"common":"Antarctica"},"region":"Antarctic"},
                {"codes":{"alpha_3":"XX"}}
                """, 3, 2, 1, false), 0));
        mvc.perform(get("/api/v1/countries").param("region", "eUrOpE").param("search", " REPUBLIC "))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(content().json("""
                        [{"code":"SVN","name":"Slovenija","capital":"Ljubljana","population":2100000,
                          "region":"Europe","flag":{"png":"https://example.test/si.png","svg":"https://example.test/si.svg",
                          "alt":"Zastava države Slovenija"}}]
                        """, org.springframework.test.json.JsonCompareMode.STRICT));
        mvc.perform(get("/api/v1/countries").param("region", "antarctic"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].code").value("ATA"));
        assertThat(requests).hasSize(2);
        assertThat(requests.stream().map(URI::getQuery)).containsExactly(
                "limit=100&offset=0&response_fields=codes.alpha_2,codes.alpha_3,names.common,names.official,names.native.slv,capitals,population,region,flag.url_png,flag.url_svg",
                "limit=100&offset=1&response_fields=codes.alpha_2,codes.alpha_3,names.common,names.official,names.native.slv,capitals,population,region,flag.url_png,flag.url_svg");
        assertThat(authorizations).containsOnly("Bearer test-only-placeholder");
    }

    @Test
    void searchesNativeLocaleAndCanonicalNamesThroughPublicApi() throws Exception {
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA + "," + CountryFixtures.GERMANY, 2, 2, 0, false));
        for (String search : List.of("slovenija", "slovenia", "republika slovenija", "republic of slovenia")) {
            mvc.perform(get("/api/v1/countries").param("search", search))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].code").value("SVN"))
                    .andExpect(jsonPath("$[0].name").value("Slovenija"));
        }
        for (String search : List.of("nemčija", "germany", "federal republic of germany")) {
            mvc.perform(get("/api/v1/countries").param("search", search))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                    .andExpect(jsonPath("$[0].code").value("DEU"))
                    .andExpect(jsonPath("$[0].name").value("Nemčija"));
        }
        assertThat(requests).hasSize(1);
    }

    @Test
    void unsupportedLocalizationInputDoesNotMakeValidDetailUnavailable() throws Exception {
        ok(CountryFixtures.page(CountryFixtures.GERMANY.replace("\"DE\"", "\"ZZ\""), 1, 1, 0, false));
        mvc.perform(get("/api/v1/countries/DEU"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value("DEU"))
                .andExpect(jsonPath("$.name").value("Germany"));
    }

    @Test
    void publicDetailNormalizesCodeMapsFullContractAndCaches() throws Exception {
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA, 1, 1, 0, false));
        mvc.perform(get("/api/v1/countries/svn")).andExpect(status().isOk())
                .andExpect(content().json("""
                        {"code":"SVN","name":"Slovenija","officialName":"Republika Slovenija",
                         "capital":["Other","Ljubljana"],"population":2100000,"area":20273.0,"populationDensity":103.59,
                         "region":"Europe","subregion":"Central Europe","currencies":[{"code":"EUR","name":"Euro","symbol":"€"}],
                         "languages":[{"code":"slv","name":"Slovene"}],"timezones":["UTC+01:00"],"borders":["AUT","HRV","ITA","HUN"],
                         "callingCodes":["+386","+387"],"drivingSide":"right","coordinates":{"latitude":46.1167,"longitude":14.8167},
                         "flag":{"png":"https://example.test/si.png","svg":"https://example.test/si.svg","alt":"Zastava države Slovenija"}}
                        """, org.springframework.test.json.JsonCompareMode.STRICT));
        mvc.perform(get("/api/v1/countries/SVN")).andExpect(status().isOk());
        assertThat(requests).singleElement().satisfies(uri -> assertThat(uri.getPath()).isEqualTo("/countries/v5/codes.alpha_3/SVN"));
        assertThat(caches.getCache("countryDetails").get("SVN")).isNotNull();
        assertThat(caches.getCache("countryDetails").get("svn")).isNull();
    }

    @ParameterizedTest
    @CsvSource({"region,Atlantis", "region,''", "sort,area", "sort,''", "direction,up", "direction,''"})
    void invalidQueryReturns400WithoutUpstreamCall(String parameter, String value) throws Exception {
        mvc.perform(get("/api/v1/countries").param(parameter, value)).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("INVALID_QUERY_PARAMETER"))
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").isString()).andExpect(jsonPath("$.detail").isString())
                .andExpect(jsonPath("$.instance").value("/api/v1/countries"));
        assertThat(requests).isEmpty();
    }

    @Test
    void exactEmptyLookupIs404AndNotCached() throws Exception {
        ok(CountryFixtures.page("", 0, 0, 0, false));
        mvc.perform(get("/api/v1/countries/ZZZ")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COUNTRY_NOT_FOUND"));
        assertThat(caches.getCache("countryDetails").get("ZZZ")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"SI", "123", "Slovenia", "ſvn"})
    void malformedCodeIs404WithoutUpstreamCall(String code) throws Exception {
        mvc.perform(get("/api/v1/countries/{code}", code)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("COUNTRY_NOT_FOUND"));
        assertThat(requests).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(ints = {401, 403, 429, 500, 502, 503, 404})
    void upstreamErrorsAreSanitized503AndNotRetried(int status) throws Exception {
        replies.add(new Reply(status, "{\"errors\":[{\"message\":\"private upstream account details\"}]}", 0));
        unavailable("/api/v1/countries/SVN");
        assertThat(requests).hasSize(1);
    }

    @Test
    void failedDetailIsNotCachedAndCanRecover() throws Exception {
        replies.add(new Reply(503, "{}", 0));
        unavailable("/api/v1/countries/SVN");
        assertThat(caches.getCache("countryDetails").get("SVN")).isNull();
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA, 1, 1, 0, false));
        mvc.perform(get("/api/v1/countries/SVN")).andExpect(status().isOk());
        assertThat(requests).hasSize(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {"countryCatalog", "countryDetails"})
    void concurrentMissesShareOneUpstreamLoad(String cacheName) throws Exception {
        int callers = 8;
        var ready = new CountDownLatch(callers);
        var start = new CountDownLatch(1);
        var misses = new CountDownLatch(callers);
        var responseStarted = new CountDownLatch(1);
        var releaseResponse = new CountDownLatch(1);
        String key = cacheName.equals("countryCatalog") ? "all" : "SVN";
        Cache cache = caches.getCache(cacheName);
        Cache observedCache = spy(cache);
        doAnswer(invocation -> {
            // Observe each miss before delegating to the unchanged, real Caffeine atomic loader.
            assertThat(cache.get(key)).as("Entry must be absent for every concurrent caller").isNull();
            misses.countDown();
            return invocation.callRealMethod();
        }).when(observedCache).get(eq(key), any(Callable.class));
        var manager = mock(CacheManager.class);
        when(manager.getCache("countryCatalog")).thenReturn(caches.getCache("countryCatalog"));
        when(manager.getCache("countryDetails")).thenReturn(caches.getCache("countryDetails"));
        when(manager.getCache(cacheName)).thenReturn(observedCache);
        var concurrentService = new CountryService(client, manager);
        replies.add(new Reply(200, CountryFixtures.page(CountryFixtures.SLOVENIA, 1, 1, 0, false),
                0, responseStarted, releaseResponse));
        var workers = Executors.newFixedThreadPool(callers);
        try {
            var futures = java.util.stream.IntStream.range(0, callers)
                    .mapToObj(i -> workers.submit(() -> {
                        ready.countDown();
                        assertThat(start.await(5, TimeUnit.SECONDS)).as("Caller start gate").isTrue();
                        return cacheName.equals("countryCatalog")
                                ? concurrentService.list(new CountryQuery(null, null, null, null)).getFirst().code()
                                : concurrentService.detail(i % 2 == 0 ? "svn" : "SVN").code();
                    })).toList();
            assertThat(ready.await(5, TimeUnit.SECONDS)).as("All callers must be ready").isTrue();
            start.countDown();
            assertThat(responseStarted.await(5, TimeUnit.SECONDS)).as("First upstream response must be blocked").isTrue();
            assertThat(misses.await(5, TimeUnit.SECONDS)).as("All callers must observe a miss before response release").isTrue();
            assertThat(futures).allMatch(future -> !future.isDone());
            releaseResponse.countDown();
            for (var future : futures) assertThat(future.get(5, TimeUnit.SECONDS)).isEqualTo("SVN");
            assertThat(requests).singleElement().satisfies(uri -> assertThat(uri.getPath()).isEqualTo(
                    cacheName.equals("countryCatalog") ? "/countries/v5" : "/countries/v5/codes.alpha_3/SVN"));
        } finally {
            start.countDown();
            releaseResponse.countDown();
            workers.shutdownNow();
            assertThat(workers.awaitTermination(5, TimeUnit.SECONDS)).as("Concurrent callers must terminate").isTrue();
        }
    }

    @Test
    void cachesHaveIndependent24HourExpiryAndBoundedSizes() {
        var catalogue = (org.springframework.cache.caffeine.CaffeineCache) caches.getCache("countryCatalog");
        var detail = (org.springframework.cache.caffeine.CaffeineCache) caches.getCache("countryDetails");
        assertThat(catalogue.getNativeCache().policy().expireAfterWrite().orElseThrow().getExpiresAfter())
                .isEqualTo(java.time.Duration.ofHours(24));
        assertThat(detail.getNativeCache().policy().expireAfterWrite().orElseThrow().getExpiresAfter())
                .isEqualTo(java.time.Duration.ofHours(24));
        assertThat(catalogue.getNativeCache().policy().eviction().orElseThrow().getMaximum()).isEqualTo(1);
        assertThat(detail.getNativeCache().policy().eviction().orElseThrow().getMaximum()).isEqualTo(300);
    }

    @Test
    void actualReadTimeoutIs503() throws Exception {
        replies.add(new Reply(200, CountryFixtures.page(CountryFixtures.SLOVENIA, 1, 1, 0, false), 3000));
        unavailable("/api/v1/countries/SVN");
        assertThat(requests).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"not JSON", "{}", "{\"data\":{}}", "{\"data\":{\"objects\":[{}]}}",
            "{\"data\":{\"objects\":[{\"codes\":{\"alpha_3\":\"ITA\"},\"names\":{\"common\":\"Italy\"}}]}}"})
    void malformedOrMismatchedDetailsAre503(String body) throws Exception {
        ok(body);
        unavailable("/api/v1/countries/SVN");
    }

    @Test
    void failedSecondPageDoesNotCachePartialCatalogueAndNextRequestCanRecover() throws Exception {
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA, 2, 1, 0, true));
        replies.add(new Reply(503, "{}", 0));
        unavailable("/api/v1/countries");
        assertThat(caches.getCache("countryCatalog").get("all")).isNull();
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA, 1, 1, 0, false));
        mvc.perform(get("/api/v1/countries")).andExpect(status().isOk());
        assertThat(requests).hasSize(3);
    }

    @Test
    void inconsistentPaginationIsRejected() throws Exception {
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA, 3, 1, 0, false));
        unavailable("/api/v1/countries");
    }

    @Test
    void unexpectedErrorHasStableSanitizedProblem() throws Exception {
        doThrow(new IllegalStateException("sensitive text")).when(service).detail("SVN");
        mvc.perform(get("/api/v1/countries/SVN")).andExpect(status().isInternalServerError())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.detail").value("An unexpected error occurred."));
    }

    @Test
    void unsupportedAcceptTypeHasStableFrameworkProblem() throws Exception {
        ok(CountryFixtures.page(CountryFixtures.SLOVENIA, 1, 1, 0, false));
        mvc.perform(get("/api/v1/countries").accept("text/plain"))
                .andExpect(status().isNotAcceptable())
                .andExpect(result -> assertThat(result.getResolvedException())
                        .isInstanceOf(org.springframework.web.HttpMediaTypeNotAcceptableException.class))
                .andExpect(content().contentType("application/problem+json"))
                .andExpect(header().string("Accept", "application/json, application/*+json"))
                .andExpect(content().json("""
                        {"type":"about:blank","title":"Not acceptable","status":406,
                         "detail":"The requested response media type is not supported.",
                         "instance":"/api/v1/countries","code":"NOT_ACCEPTABLE"}
                        """, org.springframework.test.json.JsonCompareMode.STRICT));
    }

    @Test
    void securityFoundationStillDeniesOtherRoutesAndUnsafeMethods() throws Exception {
        for (String path : List.of("/api/v1/auth/csrf", "/login", "/api/v1/countries/SVN/discussions")) {
            mvc.perform(get(path)).andExpect(status().isForbidden());
        }
        mvc.perform(post("/api/v1/countries")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/countries").with(csrf())).andExpect(status().isForbidden());
    }

    private void unavailable(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.code").value("COUNTRY_SERVICE_UNAVAILABLE"))
                .andExpect(jsonPath("$.detail").value("Country data is temporarily unavailable."))
                .andExpect(jsonPath("$.instance").value(path));
    }

    private static void ok(String body) { replies.add(new Reply(200, body, 0)); }
    private record Reply(int status, String body, long delay,
            CountDownLatch responseStarted, CountDownLatch releaseResponse) {
        Reply(int status, String body, long delay) {
            this(status, body, delay, null, null);
        }
    }

    private static HttpServer startServer() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext("/", exchange -> {
                requests.add(exchange.getRequestURI());
                authorizations.add(String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")));
                var reply = replies.poll();
                if (reply == null) reply = new Reply(500, "{}", 0);
                try {
                    if (reply.responseStarted() != null) {
                        reply.responseStarted().countDown();
                        if (!reply.releaseResponse().await(5, TimeUnit.SECONDS)) {
                            throw new IOException("Timed out waiting for concurrent callers to release the mock response");
                        }
                    }
                    Thread.sleep(reply.delay());
                    byte[] bytes = reply.body().getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(reply.status(), bytes.length);
                    exchange.getResponseBody().write(bytes);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (IOException ignored) {
                    // Expected when the client closes a timed-out connection.
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

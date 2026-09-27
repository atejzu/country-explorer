package si.atejzu.countryexplorer;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.ResultMatcher;
import org.springframework.transaction.PlatformTransactionManager;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;
import si.atejzu.countryexplorer.discussion.persistence.DiscussionRepository;
import si.atejzu.countryexplorer.comment.application.CommentService;
import si.atejzu.countryexplorer.user.domain.UserAccount;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
abstract class CommunityTestSupport {
    static final String COUNTRIES = "/api/v1/countries/SVN/discussions";
    static final String DISCUSSIONS = "/api/v1/discussions/";
    static final String COMMENTS = "/api/v1/comments/";
    private static final ConcurrentLinkedQueue<Integer> upstreamStatuses = new ConcurrentLinkedQueue<>();
    // Shared across these test classes, just like their cached Spring application context.
    private static final HttpServer upstream = startServer();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserAccountRepository users;
    @Autowired DiscussionRepository discussions;
    @Autowired CommentService comments;
    @Autowired JdbcTemplate jdbc;
    @Autowired CacheManager caches;
    @Autowired PlatformTransactionManager transactions;
    AppUserPrincipal first;
    AppUserPrincipal second;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("app.rest-countries.base-url", () -> "http://127.0.0.1:" + upstream.getAddress().getPort());
        registry.add("app.rest-countries.api-key", () -> "test-only-placeholder");
    }

    @BeforeEach
    void resetCommunity() {
        jdbc.update("delete from comments");
        jdbc.update("delete from discussions");
        users.deleteAll();
        first = account("first");
        second = account("second");
        caches.getCacheNames().forEach(name -> caches.getCache(name).clear());
        upstreamStatuses.clear();
    }

    void unavailable() { upstreamStatuses.add(503); }

    JsonNode discussion() throws Exception {
        return json(mutate("POST", COUNTRIES, first, "{\"title\":\"Travel advice\",\"body\":\"Original body\"}")
                .andExpect(status().isCreated()));
    }

    JsonNode comment(String discussionId, AppUserPrincipal author) throws Exception {
        return json(mutate("POST", DISCUSSIONS + discussionId + "/comments", author, "{\"body\":\"Visit the valley\"}")
                .andExpect(status().isCreated()));
    }

    ResultActions mutate(String method, String path, AppUserPrincipal author, String body) throws Exception {
        Cookie csrf = mvc.perform(get("/api/v1/auth/csrf")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        var request = request(HttpMethod.valueOf(method), path).cookie(csrf).header("X-XSRF-TOKEN", csrf.getValue());
        if (author != null) request.with(user(author));
        if (body != null) request.contentType("application/json").content(body);
        return mvc.perform(request);
    }

    JsonNode json(ResultActions result) throws Exception {
        return mapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    static ResultMatcher problem(int statusCode, String code) {
        return result -> {
            status().is(statusCode).match(result);
            content().contentType("application/problem+json").match(result);
            jsonPath("$.code").value(code).match(result);
            jsonPath("$.status").value(statusCode).match(result);
            jsonPath("$.instance").value(result.getRequest().getRequestURI()).match(result);
            assertThat(result.getResponse().getContentAsString()).doesNotContain(
                    "SQLException", "constraint", "password", "email", "stackTrace", "session", "credentials");
        };
    }

    long count(String table) {
        // Only test-owned constant table names are passed here.
        return jdbc.queryForObject("select count(*) from " + table, Long.class);
    }

    private AppUserPrincipal account(String name) {
        var saved = users.saveAndFlush(new UserAccount(name, name + "@example.test", "unused-test-hash"));
        return new AppUserPrincipal(saved.getId(), saved.getUsername(), saved.getEmail(), null);
    }

    private static HttpServer startServer() {
        try {
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                Integer status = upstreamStatuses.poll();
                byte[] body = """
                        {"data":{"objects":[{"codes":{"alpha_3":"SVN"},"names":{"common":"Slovenia"}}],
                        "meta":{"total":1,"count":1,"offset":0,"limit":100,"more":false}}}
                        """.getBytes(StandardCharsets.UTF_8);
                try {
                    exchange.getResponseHeaders().set("Content-Type", "application/json");
                    exchange.sendResponseHeaders(status == null ? 200 : status, body.length);
                    exchange.getResponseBody().write(body);
                } finally { exchange.close(); }
            });
            server.start();
            return server;
        } catch (IOException exception) { throw new ExceptionInInitializerError(exception); }
    }
}

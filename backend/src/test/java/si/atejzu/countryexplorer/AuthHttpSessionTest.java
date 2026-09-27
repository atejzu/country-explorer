package si.atejzu.countryexplorer;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.context.annotation.Import;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "app.rest-countries.api-key=")
class AuthHttpSessionTest {
    @LocalServerPort int port;
    @Autowired ObjectMapper mapper;
    @Autowired ServerProperties server;

    @Test
    void realHttpCookieLifecycleAndStaleSessionAfterLogout() throws Exception {
        var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        try (var client = HttpClient.newBuilder().cookieHandler(cookies).build()) {
            String token = bootstrap(client, cookies);
            var account = Map.of("username", "httpuser", "email", "httpuser@example.com", "password", "č".repeat(40));
            assertThat(send(client, "POST", "/api/v1/auth/register", mapper.writeValueAsString(account), token).statusCode())
                    .isEqualTo(201);
            assertThat(send(client, "GET", "/api/v1/users/me", null, null).statusCode()).isEqualTo(401);
            var login = send(client, "POST", "/api/v1/auth/login", mapper.writeValueAsString(account), token);
            assertThat(login.statusCode()).isEqualTo(200);
            var sessionHeader = login.headers().allValues("set-cookie").stream()
                    .filter(value -> value.startsWith("JSESSIONID=")).findFirst().orElseThrow();
            assertThat(sessionHeader).contains("HttpOnly", "SameSite=Lax").doesNotContain("Secure");
            String oldSession = cookieValue(cookies, "JSESSIONID");
            String authenticatedToken = bootstrap(client, cookies);
            assertThat(authenticatedToken).isNotEqualTo(token);
            var me = send(client, "GET", "/api/v1/users/me", null, null);
            assertThat(me.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(me.body()).propertyNames()).containsExactlyInAnyOrder("id", "username", "email", "createdAt");
            assertThat(send(client, "POST", "/api/v1/auth/logout", "", authenticatedToken).statusCode()).isEqualTo(204);
            try (var staleClient = HttpClient.newHttpClient()) {
                var stale = staleClient.send(HttpRequest.newBuilder(uri("/api/v1/users/me"))
                        .header("Cookie", "JSESSIONID=" + oldSession).GET().build(), HttpResponse.BodyHandlers.ofString());
                assertThat(stale.statusCode()).isEqualTo(401);
            }
            String anonymousToken = bootstrap(client, cookies);
            assertThat(anonymousToken).isNotEqualTo(authenticatedToken);
            assertThat(send(client, "GET", "/api/v1/users/me", null, null).statusCode()).isEqualTo(401);
            assertThat(send(client, "POST", "/api/v1/auth/login", mapper.writeValueAsString(account), anonymousToken).statusCode())
                    .isEqualTo(200);
        }
        assertThat(server.getServlet().getSession().getTimeout()).isEqualTo(java.time.Duration.ofMinutes(30));
        assertThat(server.getServlet().getSession().getCookie().getHttpOnly()).isTrue();
        assertThat(server.getServlet().getSession().getCookie().getSecure()).isFalse();
    }

    private String bootstrap(HttpClient client, CookieManager cookies) throws Exception {
        var response = send(client, "GET", "/api/v1/auth/csrf", null, null);
        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.body()).isEmpty();
        return cookieValue(cookies, "XSRF-TOKEN");
    }

    private static String cookieValue(CookieManager cookies, String name) {
        return cookies.getCookieStore().getCookies().stream().filter(cookie -> cookie.getName().equals(name))
                .findFirst().orElseThrow().getValue();
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }

    private HttpResponse<String> send(HttpClient client, String method, String path, String body, String csrf) throws Exception {
        var request = HttpRequest.newBuilder(uri(path));
        if (csrf != null) request.header("X-XSRF-TOKEN", csrf);
        if (body != null) request.header("Content-Type", "application/json");
        return client.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}

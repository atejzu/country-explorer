package si.atejzu.countryexplorer;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;

class SessionCookieConfigurationTest {
    @Test
    void deployedHttpsCanEnableSecureWithoutWeakeningOtherSessionSettings() {
        new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withPropertyValues("SESSION_COOKIE_SECURE=true")
                .withUserConfiguration(PropertiesConfiguration.class)
                .run(context -> {
                    var session = context.getBean(ServerProperties.class).getServlet().getSession();
                    assertThat(session.getCookie().getSecure()).isTrue();
                    assertThat(session.getCookie().getHttpOnly()).isTrue();
                    assertThat(session.getCookie().getSameSite().attributeValue()).isEqualTo("Lax");
                    assertThat(session.getTimeout()).isEqualTo(java.time.Duration.ofMinutes(30));
                });
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(ServerProperties.class)
    static class PropertiesConfiguration {}
}

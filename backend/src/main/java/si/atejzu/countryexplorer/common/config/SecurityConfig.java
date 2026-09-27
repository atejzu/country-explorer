package si.atejzu.countryexplorer.common.config;

import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import tools.jackson.databind.ObjectMapper;
import si.atejzu.countryexplorer.common.error.ApiAccessDeniedHandler;
import si.atejzu.countryexplorer.common.error.ApiAuthenticationEntryPoint;
import si.atejzu.countryexplorer.common.error.ApiProblemWriter;
import si.atejzu.countryexplorer.common.security.AppUserDetailsService;
import si.atejzu.countryexplorer.common.security.JsonLoginAuthenticationFilter;

@Configuration(proxyBeanMethods = false)
public class SecurityConfig {
    @Bean
    PasswordEncoder passwordEncoder() {
        String id = "pbkdf2@SpringSecurity_v5_8";
        return new DelegatingPasswordEncoder(id,
                Map.of(id, Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8()));
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, AppUserDetailsService users,
            PasswordEncoder passwords, ObjectMapper mapper) throws Exception {
        var problems = new ApiProblemWriter(mapper);
        var provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(passwords);
        var login = new JsonLoginAuthenticationFilter(new ProviderManager(provider), mapper, problems);
        var contexts = new HttpSessionSecurityContextRepository();
        var logoutPath = PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/v1/auth/logout");
        var trust = new AuthenticationTrustResolverImpl();

        http
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(HttpMethod.GET, "/actuator/health", "/api/v1/auth/csrf",
                                "/api/v1/countries", "/api/v1/countries/{countryCode}").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register", "/api/v1/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/me").authenticated()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").authenticated()
                        .anyRequest().denyAll())
                // Security 7's documented SPA handler supports plain headers and BREACH-aware attributes.
                .csrf(csrf -> csrf.spa().csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
                .securityContext(context -> context.securityContextRepository(contexts))
                .sessionManagement(session -> session.sessionFixation(fixation -> fixation.changeSessionId()))
                .requestCache(AbstractHttpConfigurer::disable)
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint(new ApiAuthenticationEntryPoint(problems))
                        .accessDeniedHandler(new ApiAccessDeniedHandler(problems)))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(logout -> logout
                        // LogoutFilter precedes AuthorizationFilter. Anonymous requests must fall through
                        // to route authorization instead of receiving a misleading successful logout.
                        .logoutRequestMatcher(request -> logoutPath.matches(request)
                                && trust.isAuthenticated(SecurityContextHolder.getContext().getAuthentication()))
                        .invalidateHttpSession(true)
                        .clearAuthentication(true)
                        .deleteCookies("JSESSIONID")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(204)))
                .with(new JsonLoginConfigurer(login, contexts), configurer -> {});
        return http.build();
    }

    private static final class JsonLoginConfigurer extends AbstractHttpConfigurer<JsonLoginConfigurer, HttpSecurity> {
        private final JsonLoginAuthenticationFilter login;
        private final HttpSessionSecurityContextRepository contexts;

        private JsonLoginConfigurer(JsonLoginAuthenticationFilter login, HttpSessionSecurityContextRepository contexts) {
            this.login = login;
            this.contexts = contexts;
        }

        @Override
        public void configure(HttpSecurity security) {
            // Reuse Spring's composite strategy: session fixation plus CSRF rotation.
            login.setSessionAuthenticationStrategy(security.getSharedObject(SessionAuthenticationStrategy.class));
            login.setSecurityContextRepository(contexts);
            security.addFilterAt(login, UsernamePasswordAuthenticationFilter.class);
        }
    }
}

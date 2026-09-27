package si.atejzu.countryexplorer.common.security;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AbstractAuthenticationProcessingFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.DeserializationFeature;
import si.atejzu.countryexplorer.auth.api.LoginResponse;
import si.atejzu.countryexplorer.common.error.ApiProblemWriter;

public final class JsonLoginAuthenticationFilter extends AbstractAuthenticationProcessingFilter {
    private final ObjectMapper mapper;

    public JsonLoginAuthenticationFilter(AuthenticationManager manager, ObjectMapper mapper, ApiProblemWriter problems) {
        super(PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.POST, "/api/v1/auth/login"), manager);
        this.mapper = mapper;
        setAuthenticationSuccessHandler((request, response, authentication) -> {
            response.setStatus(200);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(response.getOutputStream(), LoginResponse.from((AppUserPrincipal) authentication.getPrincipal()));
        });
        setAuthenticationFailureHandler((request, response, exception) -> {
            if (exception instanceof UnsupportedLoginMediaTypeException) {
                problems.write(request, response, 415, "Unsupported media type",
                        "The request media type is not supported.", "UNSUPPORTED_MEDIA_TYPE");
            } else {
                problems.write(request, response, 401, "Invalid credentials",
                        "Email or password is incorrect.", "INVALID_CREDENTIALS");
            }
        });
    }

    @Override
    public Authentication attemptAuthentication(HttpServletRequest request, HttpServletResponse response) {
        requireJson(request);
        try {
            var json = mapper.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                    .readTree(request.getInputStream());
            if (json == null || !json.isObject() || !json.path("email").isString() || !json.path("password").isString()) {
                throw new BadCredentialsException("Invalid credentials.");
            }
            String email = json.path("email").asString();
            String password = json.path("password").asString();
            if (email.isBlank() || email.length() > 254 || password.isBlank()
                    || password.length() < 8 || password.length() > 72) {
                throw new BadCredentialsException("Invalid credentials.");
            }
            var authentication = UsernamePasswordAuthenticationToken.unauthenticated(email, password);
            return getAuthenticationManager().authenticate(authentication);
        } catch (IOException | JacksonException | IllegalArgumentException exception) {
            // Never propagate parser messages or request bodies containing credentials.
            throw new BadCredentialsException("Invalid credentials.");
        }
    }

    private static void requireJson(HttpServletRequest request) {
        try {
            if (request.getContentType() == null
                    || !MediaType.APPLICATION_JSON.includes(MediaType.parseMediaType(request.getContentType()))) {
                throw new UnsupportedLoginMediaTypeException();
            }
        } catch (InvalidMediaTypeException exception) {
            throw new UnsupportedLoginMediaTypeException();
        }
    }

    private static final class UnsupportedLoginMediaTypeException extends AuthenticationException {
        private UnsupportedLoginMediaTypeException() {
            super("The request media type is not supported.");
        }
    }
}

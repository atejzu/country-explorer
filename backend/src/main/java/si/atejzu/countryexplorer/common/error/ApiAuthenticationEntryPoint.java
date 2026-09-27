package si.atejzu.countryexplorer.common.error;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

public final class ApiAuthenticationEntryPoint implements AuthenticationEntryPoint {
    private final ApiProblemWriter problems;

    public ApiAuthenticationEntryPoint(ApiProblemWriter problems) { this.problems = problems; }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        problems.write(request, response, 401, "Authentication required",
                "Authentication is required to access this resource.", "AUTHENTICATION_REQUIRED");
    }
}

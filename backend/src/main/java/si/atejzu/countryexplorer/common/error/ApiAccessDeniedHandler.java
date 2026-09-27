package si.atejzu.countryexplorer.common.error;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;

public final class ApiAccessDeniedHandler implements AccessDeniedHandler {
    private final ApiProblemWriter problems;

    public ApiAccessDeniedHandler(ApiProblemWriter problems) { this.problems = problems; }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException exception) throws IOException {
        problems.write(request, response, 403, "Access denied",
                "Access to this resource is denied.", "ACCESS_DENIED");
    }
}

package si.atejzu.countryexplorer.common.error;

import java.io.IOException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import tools.jackson.databind.ObjectMapper;

public final class ApiProblemWriter {
    private final ObjectMapper mapper;

    public ApiProblemWriter(ObjectMapper mapper) { this.mapper = mapper; }

    public void write(HttpServletRequest request, HttpServletResponse response, int status,
            String title, String detail, String code) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mapper.writeValue(response.getOutputStream(),
                new ProblemDetailResponse("about:blank", title, status, detail, request.getRequestURI(), code));
    }
}

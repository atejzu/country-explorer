package si.atejzu.countryexplorer.common.error;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonInclude;

public record ProblemDetailResponse(String type, String title, int status, String detail, String instance, String code,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<FieldError> fieldErrors) {
    public ProblemDetailResponse(String type, String title, int status, String detail, String instance, String code) {
        this(type, title, status, detail, instance, code, null);
    }

    public record FieldError(String field, String message) {}
}

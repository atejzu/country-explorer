package si.atejzu.countryexplorer.common.error;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.HttpHeaders;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.access.AccessDeniedException;
import si.atejzu.countryexplorer.auth.application.RegistrationConflictException;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import si.atejzu.countryexplorer.discussion.application.DiscussionNotFoundException;
import si.atejzu.countryexplorer.discussion.application.DiscussionNotOwnedException;
import si.atejzu.countryexplorer.discussion.application.DiscussionLockedException;
import si.atejzu.countryexplorer.comment.application.CommentNotFoundException;
import si.atejzu.countryexplorer.comment.application.CommentNotOwnedException;
import si.atejzu.countryexplorer.country.application.CountryNotFoundException;
import si.atejzu.countryexplorer.country.application.CountryServiceUnavailableException;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(DiscussionNotFoundException.class)
    ResponseEntity<Object> discussionNotFound(DiscussionNotFoundException exception, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "Discussion not found", exception.getMessage(), "DISCUSSION_NOT_FOUND", request);
    }

    @ExceptionHandler(DiscussionNotOwnedException.class)
    ResponseEntity<Object> discussionNotOwned(DiscussionNotOwnedException exception, HttpServletRequest request) {
        return problem(HttpStatus.FORBIDDEN, "Discussion not owned", exception.getMessage(), "DISCUSSION_NOT_OWNED", request);
    }

    @ExceptionHandler(DiscussionLockedException.class)
    ResponseEntity<Object> discussionLocked(DiscussionLockedException exception, HttpServletRequest request) {
        return problem(HttpStatus.CONFLICT, "Discussion is locked", exception.getMessage(), "DISCUSSION_LOCKED", request);
    }

    @ExceptionHandler(CommentNotFoundException.class)
    ResponseEntity<Object> commentNotFound(CommentNotFoundException exception, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "Comment not found", exception.getMessage(), "COMMENT_NOT_FOUND", request);
    }

    @ExceptionHandler(CommentNotOwnedException.class)
    ResponseEntity<Object> commentNotOwned(CommentNotOwnedException exception, HttpServletRequest request) {
        return problem(HttpStatus.FORBIDDEN, "Comment not owned", exception.getMessage(), "COMMENT_NOT_OWNED", request);
    }

    @ExceptionHandler(InvalidQueryParameterException.class)
    ResponseEntity<Object> invalidQuery(InvalidQueryParameterException exception, HttpServletRequest request) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid query parameter", exception.getMessage(), "INVALID_QUERY_PARAMETER", request);
    }

    @ExceptionHandler(CountryNotFoundException.class)
    ResponseEntity<Object> countryNotFound(CountryNotFoundException exception, HttpServletRequest request) {
        return problem(HttpStatus.NOT_FOUND, "Country not found", exception.getMessage(), "COUNTRY_NOT_FOUND", request);
    }

    @ExceptionHandler(CountryServiceUnavailableException.class)
    ResponseEntity<Object> countryUnavailable(CountryServiceUnavailableException exception, HttpServletRequest request) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Country service unavailable", exception.getMessage(), "COUNTRY_SERVICE_UNAVAILABLE", request);
    }

    @ExceptionHandler(RegistrationConflictException.class)
    ResponseEntity<Object> registrationConflict(RegistrationConflictException exception, HttpServletRequest request) {
        boolean username = exception.field() == RegistrationConflictException.Field.USERNAME;
        return problem(HttpStatus.CONFLICT, username ? "Username already exists" : "Email already exists",
                exception.getMessage(), username ? "USERNAME_ALREADY_EXISTS" : "EMAIL_ALREADY_EXISTS", request);
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Object> authenticationRequired(AuthenticationException exception, HttpServletRequest request) {
        return problem(HttpStatus.UNAUTHORIZED, "Authentication required",
                "Authentication is required to access this resource.", "AUTHENTICATION_REQUIRED", request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> accessDenied(AccessDeniedException exception, HttpServletRequest request) {
        return problem(HttpStatus.FORBIDDEN, "Access denied", "Access to this resource is denied.", "ACCESS_DENIED", request);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        var fields = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ProblemDetailResponse.FieldError(error.getField(), error.getDefaultMessage()))
                .sorted(Comparator.comparing(ProblemDetailResponse.FieldError::field)
                        .thenComparing(ProblemDetailResponse.FieldError::message))
                .distinct().toList();
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(new ProblemDetailResponse("about:blank", "Validation failed", 400,
                        "One or more request fields are invalid.", ((ServletWebRequest) request).getRequest().getRequestURI(),
                        "VALIDATION_FAILED", fields));
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(new ProblemDetailResponse("about:blank", "Validation failed", 400,
                        "One or more request fields are invalid.", ((ServletWebRequest) request).getRequest().getRequestURI(),
                        "VALIDATION_FAILED", List.of()));
    }

    @Override
    protected ResponseEntity<Object> handleTypeMismatch(TypeMismatchException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (exception instanceof MethodArgumentTypeMismatchException mismatch
                && mismatch.getRequiredType() == UUID.class
                && mismatch.getParameter().hasParameterAnnotation(PathVariable.class)) {
            return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_PROBLEM_JSON)
                    .body(new ProblemDetailResponse("about:blank", "Validation failed", 400,
                            "The resource identifier is invalid.", ((ServletWebRequest) request).getRequest().getRequestURI(),
                            "VALIDATION_FAILED", List.of()));
        }
        return super.handleTypeMismatch(exception, headers, status, request);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception exception, HttpServletRequest request) {
        // Do not render/log arbitrary exception messages that could contain upstream credentials.
        log.error("Unexpected application failure: category={}, location={}", exception.getClass().getName(),
                exception.getStackTrace().length == 0 ? "unknown" : exception.getStackTrace()[0]);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error", "An unexpected error occurred.", "INTERNAL_ERROR", request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ResponseEntity<Object> normalized;
        if (exception instanceof HttpMessageNotWritableException) {
            normalized = problem(status, headers, "Internal server error", "An unexpected error occurred.",
                    "INTERNAL_ERROR", ((ServletWebRequest) request).getRequest());
        } else if (exception instanceof HttpMediaTypeNotAcceptableException) {
            normalized = problem(status, headers, "Not acceptable", "The requested response media type is not supported.",
                    "NOT_ACCEPTABLE", ((ServletWebRequest) request).getRequest());
        } else if (exception instanceof HttpMediaTypeNotSupportedException) {
            normalized = problem(status, headers, "Unsupported media type", "The request media type is not supported.",
                    "UNSUPPORTED_MEDIA_TYPE", ((ServletWebRequest) request).getRequest());
        } else {
            return super.handleExceptionInternal(exception, body, headers, status, request);
        }
        // Retain Spring's committed-response handling and request error attributes.
        return super.handleExceptionInternal(exception, normalized.getBody(), normalized.getHeaders(), status, request);
    }

    private ResponseEntity<Object> problem(HttpStatus status, String title, String detail,
            String code, HttpServletRequest request) {
        return problem(status, HttpHeaders.EMPTY, title, detail, code, request);
    }

    private ResponseEntity<Object> problem(HttpStatusCode status, HttpHeaders headers, String title,
            String detail, String code, HttpServletRequest request) {
        return ResponseEntity.status(status).headers(headers).contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(new ProblemDetailResponse("about:blank", title, status.value(), detail, request.getRequestURI(), code));
    }
}

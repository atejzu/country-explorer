package si.atejzu.countryexplorer.comment.api;

import java.net.URI;
import java.util.UUID;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import si.atejzu.countryexplorer.common.api.PageQuery;
import si.atejzu.countryexplorer.common.api.PageResponse;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;
import si.atejzu.countryexplorer.comment.application.CommentService;

@RestController
@RequestMapping("/api/v1")
public class CommentController {
    private final CommentService service;

    public CommentController(CommentService service) { this.service = service; }

    @GetMapping("/discussions/{discussionId}/comments")
    public PageResponse<CommentResponse> list(@PathVariable UUID discussionId,
            @RequestParam(defaultValue = "0") String page,
            @RequestParam(defaultValue = "20") String size) {
        return service.list(discussionId, PageQuery.parse(page, size, 100));
    }

    @PostMapping("/discussions/{discussionId}/comments")
    public ResponseEntity<CommentResponse> create(@PathVariable UUID discussionId,
            @AuthenticationPrincipal AppUserPrincipal principal, @Valid @RequestBody CreateCommentRequest request) {
        var response = service.createComment(discussionId, principal.userId(), request);
        return ResponseEntity.created(URI.create("/api/v1/comments/" + response.id())).body(response);
    }

    @PatchMapping("/comments/{id}")
    public CommentResponse update(@PathVariable UUID id, @AuthenticationPrincipal AppUserPrincipal principal,
            @Valid @RequestBody UpdateCommentRequest request) {
        return service.updateComment(id, principal.userId(), request);
    }

    @DeleteMapping("/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal AppUserPrincipal principal) {
        service.deleteComment(id, principal.userId());
    }
}

package si.atejzu.countryexplorer.discussion.api;

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
import si.atejzu.countryexplorer.discussion.application.DiscussionService;

@RestController
@RequestMapping("/api/v1")
public class DiscussionController {
    private final DiscussionService service;

    public DiscussionController(DiscussionService service) { this.service = service; }

    @GetMapping("/countries/{countryCode}/discussions")
    public PageResponse<DiscussionSummaryResponse> list(@PathVariable String countryCode,
            @RequestParam(defaultValue = "0") String page,
            @RequestParam(defaultValue = "10") String size) {
        return service.list(countryCode, PageQuery.parse(page, size, 50));
    }

    @PostMapping("/countries/{countryCode}/discussions")
    public ResponseEntity<DiscussionResponse> create(@PathVariable String countryCode,
            @AuthenticationPrincipal AppUserPrincipal principal, @Valid @RequestBody CreateDiscussionRequest request) {
        var response = service.createDiscussion(principal.userId(), countryCode, request);
        return ResponseEntity.created(URI.create("/api/v1/discussions/" + response.id())).body(response);
    }

    @GetMapping("/discussions/{id}")
    public DiscussionResponse detail(@PathVariable UUID id) { return service.detail(id); }

    @PatchMapping("/discussions/{id}")
    public DiscussionResponse update(@PathVariable UUID id, @AuthenticationPrincipal AppUserPrincipal principal,
            @Valid @RequestBody UpdateDiscussionRequest request) {
        return service.updateDiscussion(id, principal.userId(), request);
    }

    @DeleteMapping("/discussions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id, @AuthenticationPrincipal AppUserPrincipal principal) {
        service.deleteDiscussion(id, principal.userId());
    }
}

package si.atejzu.countryexplorer.discussion.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateDiscussionRequest(@NotBlank @Size(min = 5, max = 150) String title,
        @NotBlank @Size(max = 5000) String body) {}

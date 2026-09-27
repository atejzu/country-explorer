package si.atejzu.countryexplorer.discussion.api;

import java.time.Instant;
import java.util.UUID;
import si.atejzu.countryexplorer.user.api.PublicUserResponse;

public record DiscussionSummaryResponse(UUID id, String title, PublicUserResponse author,
        String countryCode, long commentCount, boolean locked, Instant createdAt, Instant updatedAt) {
    // Scalar query projection exposes only the public author identity.
    public DiscussionSummaryResponse(UUID id, String title, UUID authorId, String username,
            String countryCode, long commentCount, boolean locked, Instant createdAt, Instant updatedAt) {
        this(id, title, new PublicUserResponse(authorId, username), countryCode, commentCount, locked, createdAt, updatedAt);
    }
}

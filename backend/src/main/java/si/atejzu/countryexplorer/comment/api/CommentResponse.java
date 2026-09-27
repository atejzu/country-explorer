package si.atejzu.countryexplorer.comment.api;

import java.time.Instant;
import java.util.UUID;
import si.atejzu.countryexplorer.user.api.PublicUserResponse;

public record CommentResponse(UUID id, UUID discussionId, PublicUserResponse author, String body,
        Instant createdAt, Instant updatedAt) {
    // Scalar query projection exposes only the public author identity.
    public CommentResponse(UUID id, UUID discussionId, UUID authorId, String username, String body,
        Instant createdAt, Instant updatedAt) {
        this(id, discussionId, new PublicUserResponse(authorId, username), body, createdAt, updatedAt);
    }
}

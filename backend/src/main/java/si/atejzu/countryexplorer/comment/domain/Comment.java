package si.atejzu.countryexplorer.comment.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

@Entity
@Table(name = "comments")
@EntityListeners(AuditingEntityListener.class)
public class Comment {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // Identifier-only relationships avoid loading private account data or entity graphs.
    @Column(name = "author_id", nullable = false, updatable = false)
    private UUID authorId;

    @Column(name = "discussion_id", nullable = false, updatable = false)
    private UUID discussionId;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Comment() {}

    public Comment(UUID discussionId, UUID authorId, String body) {
        this.discussionId = discussionId;
        this.authorId = authorId;
        this.body = body;
    }

    public UUID getDiscussionId() { return discussionId; }
    public void edit(String body) { this.body = body; }

    public UUID getId() { return id; }
    public UUID getAuthorId() { return authorId; }
    public String getBody() { return body; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}

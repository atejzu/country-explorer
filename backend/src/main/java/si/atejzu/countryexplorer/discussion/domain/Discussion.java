package si.atejzu.countryexplorer.discussion.domain;

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
@Table(name = "discussions")
@EntityListeners(AuditingEntityListener.class)
public class Discussion {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // Identifier-only relationships avoid loading private account data or entity graphs.
    @Column(name = "author_id", nullable = false, updatable = false)
    private UUID authorId;

    @Column(name = "country_code", nullable = false, length = 3, updatable = false)
    private String countryCode;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(name = "has_received_comments", nullable = false)
    private boolean hasReceivedComments;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Discussion() {}

    public Discussion(UUID authorId, String countryCode, String title, String body) {
        this.authorId = authorId;
        this.countryCode = countryCode;
        this.title = title;
        this.body = body;
    }

    public String getCountryCode() { return countryCode; }
    public String getTitle() { return title; }
    public boolean hasReceivedComments() { return hasReceivedComments; }

    public void edit(String title, String body) {
        if (title != null) this.title = title;
        if (body != null) this.body = body;
    }

    // Deliberately no setter accepting false: this historical state is monotonic.
    public void receiveComment() { hasReceivedComments = true; }

    public UUID getId() { return id; }
    public UUID getAuthorId() { return authorId; }
    public String getBody() { return body; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}

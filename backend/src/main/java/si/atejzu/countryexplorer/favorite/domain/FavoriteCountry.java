package si.atejzu.countryexplorer.favorite.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "favorite_countries")
public class FavoriteCountry {
    @Id
    private UUID id;

    // Ownership needs only the identifier, not a loaded UserAccount graph.
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "country_code", nullable = false, length = 3, updatable = false)
    private String countryCode;

    // The atomic native insert supplies this timestamp; JPA auditing does not run for native SQL.
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected FavoriteCountry() {}

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public String getCountryCode() { return countryCode; }
    public Instant getCreatedAt() { return createdAt; }
}

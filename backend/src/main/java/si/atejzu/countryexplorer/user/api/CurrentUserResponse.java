package si.atejzu.countryexplorer.user.api;

import java.time.Instant;
import java.util.UUID;
import si.atejzu.countryexplorer.user.domain.UserAccount;

public record CurrentUserResponse(UUID id, String username, String email, Instant createdAt) {
    public static CurrentUserResponse from(UserAccount user) {
        return new CurrentUserResponse(user.getId(), user.getUsername(), user.getEmail(), user.getCreatedAt());
    }
}

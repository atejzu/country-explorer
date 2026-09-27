package si.atejzu.countryexplorer.auth.api;

import java.util.UUID;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;

public record LoginResponse(User user) {
    public record User(UUID id, String username, String email) {}

    public static LoginResponse from(AppUserPrincipal principal) {
        return new LoginResponse(new User(principal.userId(), principal.getUsername(), principal.email()));
    }
}

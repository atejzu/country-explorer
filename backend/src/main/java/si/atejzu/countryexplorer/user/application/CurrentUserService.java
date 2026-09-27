package si.atejzu.countryexplorer.user.application;

import java.util.UUID;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.atejzu.countryexplorer.user.api.CurrentUserResponse;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;

@Service
public class CurrentUserService {
    private final UserAccountRepository users;

    public CurrentUserService(UserAccountRepository users) { this.users = users; }

    @Transactional(readOnly = true)
    public CurrentUserResponse currentUser(UUID userId) {
        return users.findById(userId).map(CurrentUserResponse::from)
                .orElseThrow(() -> new AuthenticationCredentialsNotFoundException("Account unavailable."));
    }
}

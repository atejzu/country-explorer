package si.atejzu.countryexplorer.common.security;

import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;

@Service
public class AppUserDetailsService implements UserDetailsService {
    private final UserAccountRepository users;

    public AppUserDetailsService(UserAccountRepository users) { this.users = users; }

    @Override
    @Transactional(readOnly = true)
    public AppUserPrincipal loadUserByUsername(String email) {
        var user = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new UsernameNotFoundException("Invalid credentials."));
        return new AppUserPrincipal(user.getId(), user.getUsername(), user.getEmail(), user.getPasswordHash());
    }
}

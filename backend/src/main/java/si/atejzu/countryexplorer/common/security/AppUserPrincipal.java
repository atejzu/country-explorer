package si.atejzu.countryexplorer.common.security;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public final class AppUserPrincipal implements UserDetails, CredentialsContainer {
    private static final long serialVersionUID = 1L;
    private final UUID userId;
    private final String username;
    private final String email;
    private String passwordHash;

    public AppUserPrincipal(UUID userId, String username, String email, String passwordHash) {
        this.userId = userId;
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public UUID userId() { return userId; }
    public String email() { return email; }
    @Override public String getUsername() { return username; }
    @Override public String getPassword() { return passwordHash; }
    @Override public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }
    @Override public void eraseCredentials() { passwordHash = null; }
}

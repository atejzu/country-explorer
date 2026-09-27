package si.atejzu.countryexplorer.auth.application;

import org.postgresql.util.PSQLException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.atejzu.countryexplorer.auth.api.RegisterRequest;
import si.atejzu.countryexplorer.user.api.CurrentUserResponse;
import si.atejzu.countryexplorer.user.domain.UserAccount;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;

@Service
public class RegistrationService {
    private final UserAccountRepository users;
    private final PasswordEncoder passwords;

    public RegistrationService(UserAccountRepository users, PasswordEncoder passwords) {
        this.users = users;
        this.passwords = passwords;
    }

    @Transactional
    public CurrentUserResponse register(RegisterRequest request) {
        // Existing conflicts have deterministic precedence: username before email.
        if (users.existsByUsernameIgnoreCase(request.username())) {
            throw new RegistrationConflictException(RegistrationConflictException.Field.USERNAME);
        }
        if (users.existsByEmailIgnoreCase(request.email())) {
            throw new RegistrationConflictException(RegistrationConflictException.Field.EMAIL);
        }
        // Database indexes are authoritative, including under concurrent registrations.
        // Flush here so translation happens before the transaction leaves this service.
        try {
            var user = users.saveAndFlush(new UserAccount(request.username(), request.email(),
                    passwords.encode(request.password())));
            return CurrentUserResponse.from(user);
        } catch (DataIntegrityViolationException exception) {
            for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
                if (cause instanceof PSQLException postgres && "23505".equals(postgres.getSQLState())
                        && postgres.getServerErrorMessage() != null) {
                    // In a race, either conflict is valid; use the actual structured index name.
                    String constraint = postgres.getServerErrorMessage().getConstraint();
                    if ("ux_users_username_lower".equals(constraint)) {
                        throw new RegistrationConflictException(RegistrationConflictException.Field.USERNAME);
                    }
                    if ("ux_users_email_lower".equals(constraint)) {
                        throw new RegistrationConflictException(RegistrationConflictException.Field.EMAIL);
                    }
                }
            }
            throw exception;
        }
    }
}

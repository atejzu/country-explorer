package si.atejzu.countryexplorer.auth.application;

import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.postgresql.util.PSQLException;
import org.postgresql.util.ServerErrorMessage;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import si.atejzu.countryexplorer.auth.api.RegisterRequest;
import si.atejzu.countryexplorer.user.domain.UserAccount;
import si.atejzu.countryexplorer.user.persistence.UserAccountRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RegistrationServiceTest {
    private static final RegisterRequest REQUEST = new RegisterRequest("Marko", "user@example.com", "testpassword");
    @Mock UserAccountRepository users;
    @Mock PasswordEncoder passwords;
    private RegistrationService service;

    @BeforeEach
    void setUp() { service = new RegistrationService(users, passwords); }

    static Stream<Arguments> reportedConflicts() {
        return Stream.of("duplicate key violates unique constraint", "Podvojen ključ krši omejitev", "arbitrary text")
                .flatMap(message -> Stream.of(
                        Arguments.of(message, "ux_users_username_lower", RegistrationConflictException.Field.USERNAME),
                        Arguments.of(message, "ux_users_email_lower", RegistrationConflictException.Field.EMAIL)));
    }

    @ParameterizedTest
    @MethodSource("reportedConflicts")
    void raceUsesStructuredConstraintRegardlessOfMessage(String message, String constraint,
            RegistrationConflictException.Field expected) {
        // Both pre-checks pass, then the database reports the conflict that won the race.
        var failure = integrityFailure("23505", constraint, message);
        when(users.saveAndFlush(any(UserAccount.class))).thenThrow(failure);
        assertThatThrownBy(() -> service.register(REQUEST)).isInstanceOfSatisfying(
                RegistrationConflictException.class, conflict -> assertThat(conflict.field()).isEqualTo(expected));
        var order = inOrder(users);
        order.verify(users).existsByUsernameIgnoreCase(REQUEST.username());
        order.verify(users).existsByEmailIgnoreCase(REQUEST.email());
        order.verify(users).saveAndFlush(any(UserAccount.class));
    }

    static Stream<Arguments> unrelatedIntegrityFailures() {
        return Stream.of(
                Arguments.of(integrityFailure("23505", "users_pkey", "ux_users_username_lower")),
                Arguments.of(integrityFailure("23503", "ux_users_email_lower", "unique constraint")),
                Arguments.of(integrityFailure("23505", null, "ux_users_username_lower")),
                Arguments.of(new DataIntegrityViolationException("ux_users_email_lower")),
                Arguments.of(new DataIntegrityViolationException("wrapped",
                        new PSQLException("ux_users_username_lower", org.postgresql.util.PSQLState.UNIQUE_VIOLATION))));
    }

    @ParameterizedTest
    @MethodSource("unrelatedIntegrityFailures")
    void unknownOrUnrelatedIntegrityFailurePropagatesUnchanged(DataIntegrityViolationException failure) {
        when(users.saveAndFlush(any(UserAccount.class))).thenThrow(failure);
        assertThatThrownBy(() -> service.register(REQUEST)).isSameAs(failure);
    }

    @Test
    void existingUsernameWinsWithoutConsultingEmailOrEncoding() {
        when(users.existsByUsernameIgnoreCase(REQUEST.username())).thenReturn(true);
        assertThatThrownBy(() -> service.register(REQUEST)).isInstanceOfSatisfying(
                RegistrationConflictException.class,
                conflict -> assertThat(conflict.field()).isEqualTo(RegistrationConflictException.Field.USERNAME));
        verify(users).existsByUsernameIgnoreCase(REQUEST.username());
        verifyNoMoreInteractions(users);
        verifyNoInteractions(passwords);
    }

    private static DataIntegrityViolationException integrityFailure(String sqlState, String constraint, String message) {
        // PostgreSQL protocol fields: SQLSTATE (C), message (M), constraint (n).
        String fields = "SERROR\0C" + sqlState + "\0M" + message + "\0"
                + (constraint == null ? "" : "n" + constraint + "\0") + "\0";
        var postgres = new PSQLException(new ServerErrorMessage(fields));
        return new DataIntegrityViolationException("wrapped", new RuntimeException("nested", postgres));
    }
}

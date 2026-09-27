package si.atejzu.countryexplorer.user.persistence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import si.atejzu.countryexplorer.user.domain.UserAccount;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    // LOWER matches the PostgreSQL expression indexes, including their case semantics.
    @Query("select u from UserAccount u where lower(u.email) = lower(:email)")
    Optional<UserAccount> findByEmailIgnoreCase(String email);

    @Query("select (count(u) > 0) from UserAccount u where lower(u.username) = lower(:username)")
    boolean existsByUsernameIgnoreCase(String username);

    @Query("select (count(u) > 0) from UserAccount u where lower(u.email) = lower(:email)")
    boolean existsByEmailIgnoreCase(String email);
}

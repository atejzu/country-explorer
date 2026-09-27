package si.atejzu.countryexplorer.favorite.persistence;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.transaction.annotation.Transactional;
import si.atejzu.countryexplorer.favorite.domain.FavoriteCountry;

public interface FavoriteCountryRepository extends Repository<FavoriteCountry, UUID> {
    @Transactional(readOnly = true)
    List<FavoriteCountry> findAllByUserId(UUID userId);

    @Transactional(readOnly = true)
    boolean existsByUserIdAndCountryCode(UUID userId, String countryCode);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO favorite_countries (id, user_id, country_code, created_at)
            VALUES (:id, :userId, :countryCode, :createdAt)
            ON CONFLICT (user_id, country_code) DO NOTHING
            """, nativeQuery = true)
    int insertIfAbsent(UUID id, UUID userId, String countryCode, Instant createdAt);

    @Modifying
    @Transactional
    @Query("delete from FavoriteCountry f where f.userId = :userId and f.countryCode = :countryCode")
    int deleteByUserIdAndCountryCode(UUID userId, String countryCode);
}

package si.atejzu.countryexplorer.favorite.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import si.atejzu.countryexplorer.country.api.CountryApiMapper;
import si.atejzu.countryexplorer.country.application.CountryService;
import si.atejzu.countryexplorer.favorite.api.FavoriteCountryResponse;
import si.atejzu.countryexplorer.favorite.domain.FavoriteCountry;
import si.atejzu.countryexplorer.favorite.persistence.FavoriteCountryRepository;

@Service
public class FavoriteService {
    private final FavoriteCountryRepository favorites;
    private final CountryService countries;
    private final CountryApiMapper mapper;

    public FavoriteService(FavoriteCountryRepository favorites, CountryService countries, CountryApiMapper mapper) {
        this.favorites = favorites;
        this.countries = countries;
        this.mapper = mapper;
    }

    public List<FavoriteCountryResponse> list(UUID userId) {
        var saved = favorites.findAllByUserId(userId);
        var summaries = countries.summaries(saved.stream().map(FavoriteCountry::getCountryCode).toList());
        return saved.stream().map(favorite -> new FavoriteCountryResponse(
                mapper.summary(summaries.get(favorite.getCountryCode())), favorite.getCreatedAt())).toList();
    }

    public void add(UUID userId, String countryCode) {
        String code = CountryService.normalizeCode(countryCode);
        // An existing favourite needs no upstream revalidation. This is only a fast path:
        // the database ON CONFLICT remains authoritative when concurrent callers both see absence.
        if (favorites.existsByUserIdAndCountryCode(userId, code)) return;
        countries.summaries(List.of(code));
        // Country resolution has completed before the repository opens the write transaction.
        favorites.insertIfAbsent(UUID.randomUUID(), userId, code, Instant.now());
    }

    public void remove(UUID userId, String countryCode) {
        favorites.deleteByUserIdAndCountryCode(userId, CountryService.normalizeCode(countryCode));
    }
}

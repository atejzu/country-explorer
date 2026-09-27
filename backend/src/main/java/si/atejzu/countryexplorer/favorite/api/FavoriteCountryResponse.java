package si.atejzu.countryexplorer.favorite.api;

import java.time.Instant;
import si.atejzu.countryexplorer.country.api.CountrySummaryResponse;

public record FavoriteCountryResponse(CountrySummaryResponse country, Instant favoritedAt) {}

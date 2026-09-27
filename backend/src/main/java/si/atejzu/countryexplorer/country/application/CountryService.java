package si.atejzu.countryexplorer.country.application;

import java.text.Collator;
import java.util.Comparator;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;
import si.atejzu.countryexplorer.country.domain.CountryDetail;
import si.atejzu.countryexplorer.country.domain.CountrySummary;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesClient;

@Service
public class CountryService {
    private final RestCountriesClient client;
    private final Cache catalogue;
    private final Cache details;

    public CountryService(RestCountriesClient client, CacheManager cacheManager) {
        this.client = client;
        this.catalogue = Objects.requireNonNull(cacheManager.getCache("countryCatalog"));
        this.details = Objects.requireNonNull(cacheManager.getCache("countryDetails"));
    }

    public List<CountrySummary> list(CountryQuery query) {
        // Collator is mutable and not thread-safe, so each request owns its instance.
        var collator = Collator.getInstance(Locale.forLanguageTag("sl-SI"));
        Comparator<CountrySummary> names = Comparator.comparing(CountrySummary::name, collator)
                .thenComparing(CountrySummary::code);
        Comparator<CountrySummary> order;
        if (query.sort().equals("population")) {
            Comparator<Long> populations = query.direction().equals("desc") ? Comparator.reverseOrder() : Comparator.naturalOrder();
            order = Comparator.comparing(CountrySummary::population, Comparator.nullsLast(populations)).thenComparing(names);
        } else {
            order = query.direction().equals("desc") ? names.reversed() : names;
        }
        List<CountrySummary> countries = cached(catalogue, "all", client::catalogue);
        return countries.stream().filter(c -> query.region() == null || query.region().equals(c.region()))
                .filter(c -> matches(c, query.search())).sorted(order).toList();
    }

    public CountryDetail detail(String countryCode) {
        String code = normalizeCode(countryCode);
        return cached(details, code, () -> client.detail(code));
    }

    public Map<String, CountrySummary> summaries(Collection<String> countryCodes) {
        var codes = countryCodes.stream().map(CountryService::normalizeCode).distinct().toList();
        if (codes.isEmpty()) return Map.of();
        List<CountrySummary> countries = cached(catalogue, "all", client::catalogue);
        var byCode = new HashMap<String, CountrySummary>();
        countries.forEach(country -> byCode.put(country.code(), country));
        var resolved = new HashMap<String, CountrySummary>();
        for (String code : codes) {
            var country = byCode.get(code);
            if (country == null) throw new CountryNotFoundException();
            resolved.put(code, country);
        }
        return Map.copyOf(resolved);
    }

    public static String normalizeCode(String countryCode) {
        if (countryCode == null || !countryCode.matches("[A-Za-z]{3}")) throw new CountryNotFoundException();
        return countryCode.toUpperCase(Locale.ROOT);
    }

    private boolean matches(CountrySummary country, String search) {
        return search.isEmpty() || Stream.of(country.name(), country.officialName(), country.canonicalName(), country.canonicalOfficialName())
                .filter(Objects::nonNull).anyMatch(name -> name.toLowerCase(Locale.ROOT).contains(search));
    }

    // Spring Cache's loader is atomic for Caffeine and does not cache failed loads.
    private <T> T cached(Cache cache, String key, java.util.concurrent.Callable<T> loader) {
        try {
            return cache.get(key, loader);
        } catch (Cache.ValueRetrievalException e) {
            if (e.getCause() instanceof RuntimeException cause) throw cause;
            throw e;
        }
    }
}

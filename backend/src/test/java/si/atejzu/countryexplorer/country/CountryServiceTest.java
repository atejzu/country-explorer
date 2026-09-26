package si.atejzu.countryexplorer.country;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import si.atejzu.countryexplorer.country.application.CountryQuery;
import si.atejzu.countryexplorer.country.application.CountryService;
import si.atejzu.countryexplorer.country.domain.CountrySummary;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class CountryServiceTest {
    private final RestCountriesClient client = mock(RestCountriesClient.class);
    private CountryService service;

    @BeforeEach
    void setup() {
        var manager = new ConcurrentMapCacheManager("countryCatalog", "countryDetails");
        service = new CountryService(client, manager);
        when(client.catalogue()).thenReturn(List.of(
                country("CHE", "Švica", "Switzerland", 100L, "Europe"),
                country("SVN", "Slovenija", "Slovenia", 50L, "Europe"),
                country("CZE", "Češka", "Czechia", 100L, "Europe"),
                country("CYP", "Ciper", "Cyprus", 200L, "Europe")));
    }

    @ParameterizedTest
    @ValueSource(strings = {"slovenija", "SLOVENIJA", " slovenija ", "oven", "Slovenia", "Republic of Slovenia", "Republika Slovenija"})
    void searchesAllLocalizedAndCanonicalNames(String search) {
        assertThat(service.list(new CountryQuery(search, null, null, null)))
                .extracting(CountrySummary::code).containsExactly("SVN");
    }

    @Test
    void blankSearchAndCatalogueCache() {
        assertThat(service.list(new CountryQuery("   ", null, null, null))).hasSize(4);
        assertThat(service.list(new CountryQuery(null, null, null, null))).hasSize(4);
        verify(client, times(1)).catalogue();
    }

    @Test
    void localizedCollationAndPopulationTieBreaks() {
        assertCodes("name", "asc", "CYP", "CZE", "SVN", "CHE");
        assertCodes("name", "desc", "CHE", "SVN", "CZE", "CYP");
        assertCodes("population", "asc", "SVN", "CZE", "CHE", "CYP");
        assertCodes("population", "desc", "CYP", "CZE", "CHE", "SVN");
    }

    @ParameterizedTest
    @ValueSource(strings = {"Africa", "Americas", "Asia", "Europe", "Oceania", "Antarctic"})
    void filtersEveryRegionTogetherWithSearch(String region) {
        when(client.catalogue()).thenReturn(List.of(country("AAA", "Target", "Target", 1L, region),
                country("BBB", "Other", "Other", 1L, region), country("CCC", "Target", "Target", 1L, "Elsewhere")));
        assertThat(service.list(new CountryQuery("target", region, null, null)))
                .extracting(CountrySummary::code).containsExactly("AAA");
    }

    private void assertCodes(String sort, String direction, String... codes) {
        assertThat(service.list(new CountryQuery(null, null, sort, direction)))
                .extracting(CountrySummary::code).containsExactly(codes);
    }

    private CountrySummary country(String code, String name, String canonical, Long population, String region) {
        return new CountrySummary(code, name, "Republika " + name, canonical, "Republic of " + canonical,
                null, population, region, null);
    }
}

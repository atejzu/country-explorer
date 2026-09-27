package si.atejzu.countryexplorer.country;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import si.atejzu.countryexplorer.country.application.CountryQuery;
import si.atejzu.countryexplorer.country.application.CountryService;
import si.atejzu.countryexplorer.country.application.CountryNotFoundException;
import si.atejzu.countryexplorer.country.application.CountryServiceUnavailableException;
import si.atejzu.countryexplorer.country.domain.CountrySummary;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
    void bulkSummariesNormalizeExactCodesAndShareExplorerCatalogue() {
        var summaries = service.summaries(List.of("svn", "CHE", "SVN"));
        assertThat(summaries).containsOnlyKeys("SVN", "CHE");
        assertThat(summaries.get("SVN").name()).isEqualTo("Slovenija");
        service.list(new CountryQuery(null, null, null, null));
        service.summaries(List.of("CZE"));
        verify(client, times(1)).catalogue();
        verify(client, never()).detail(anyString());
    }

    @Test
    void emptySummaryRequestDoesNotLoadCatalogue() {
        assertThat(service.summaries(List.of())).isEmpty();
        verifyNoInteractions(client);
    }

    @Test
    void missingExactCodeRejectsEntireBulkResultWithoutFuzzyMatching() {
        when(client.catalogue()).thenReturn(List.of(country("SVN", "ZZZ", "ZZZ", 1L, "Europe")));
        assertThatThrownBy(() -> service.summaries(List.of("SVN", "ZZZ")))
                .isInstanceOf(CountryNotFoundException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SI", "123", "Slovenia", "ſvn", "ŠVN", " svn"})
    void malformedSummaryCodeFailsBeforeUpstream(String code) {
        assertThatThrownBy(() -> service.summaries(List.of(code))).isInstanceOf(CountryNotFoundException.class);
        verifyNoInteractions(client);
    }

    @Test
    void unavailableSummaryCatalogueIsNotCachedAndCanRecover() {
        when(client.catalogue()).thenThrow(new CountryServiceUnavailableException())
                .thenReturn(List.of(country("SVN", "Slovenija", "Slovenia", 1L, "Europe")));
        assertThatThrownBy(() -> service.summaries(List.of("SVN")))
                .isInstanceOf(CountryServiceUnavailableException.class);
        assertThat(service.summaries(List.of("SVN"))).containsOnlyKeys("SVN");
        verify(client, times(2)).catalogue();
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

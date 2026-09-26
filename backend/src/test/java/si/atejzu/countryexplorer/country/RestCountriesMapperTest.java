package si.atejzu.countryexplorer.country;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesMapper;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesResponse.Country;

import static org.assertj.core.api.Assertions.assertThat;

class RestCountriesMapperTest {
    private final RestCountriesMapper mapper = new RestCountriesMapper();
    private final JsonMapper json = JsonMapper.builder().build();

    @Test
    void mapsLocalizedNamesCapitalsFlagsAndRichDetails() {
        Country country = json.readValue(CountryFixtures.SLOVENIA, Country.class);
        var summary = mapper.summary(country).orElseThrow();
        assertThat(summary.name()).isEqualTo("Slovenija");
        assertThat(summary.officialName()).isEqualTo("Republika Slovenija");
        assertThat(summary.canonicalName()).isEqualTo("Slovenia");
        assertThat(summary.canonicalOfficialName()).isEqualTo("Republic of Slovenia");
        assertThat(summary.capital()).isEqualTo("Ljubljana");
        var detail = mapper.detail(country);
        assertThat(detail.capital()).containsExactly("Other", "Ljubljana");
        assertThat(detail.callingCodes()).containsExactly("+386", "+387");
        assertThat(detail.flag().png()).isEqualTo("https://example.test/si.png");
        assertThat(detail.flag().svg()).isEqualTo("https://example.test/si.svg");
        assertThat(detail.flag().alt()).isEqualTo("Zastava države Slovenija");
        assertThat(detail.populationDensity()).isEqualByComparingTo("103.59");
        assertThat(detail.area()).isEqualByComparingTo("20273.0");
        assertThat(detail.coordinates().latitude()).isEqualByComparingTo("46.1167");
        assertThat(detail.languages().getFirst().code()).isEqualTo("slv");
        assertThat(detail.currencies().getFirst().symbol()).isEqualTo("€");
    }

    @Test
    void fallsBackIndependentlyAndUsesFirstNamedCapital() {
        var source = CountryFixtures.SLOVENIA.replace("\"official\":\"Republika Slovenija\"", "\"official\":\"\"")
                .replace("\"primary\":true", "\"primary\":false");
        var summary = mapper.summary(json.readValue(source, Country.class)).orElseThrow();
        assertThat(summary.name()).isEqualTo("Slovenija");
        assertThat(summary.officialName()).isEqualTo("Republic of Slovenia");
        assertThat(summary.capital()).isEqualTo("Other");
    }

    @Test
    void absentOptionalFieldsAndTranslationsAreSafe() {
        var country = json.readValue("""
                {"codes":{"alpha_3":"ATA"},"names":{"common":"Antarctica","official":"Antarctica"}}
                """, Country.class);
        var summary = mapper.summary(country).orElseThrow();
        assertThat(summary.name()).isEqualTo("Antarctica");
        assertThat(summary.officialName()).isEqualTo("Antarctica");
        assertThat(summary.capital()).isNull();
        var detail = mapper.detail(country);
        assertThat(detail.capital()).isEmpty();
        assertThat(detail.languages()).isEmpty();
        assertThat(detail.currencies()).isEmpty();
        assertThat(detail.callingCodes()).isEmpty();
        assertThat(detail.coordinates()).isNull();
        assertThat(detail.populationDensity()).isNull();
        assertThat(detail.flag().png()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1"})
    void doesNotDivideByInvalidArea(String area) {
        var source = CountryFixtures.SLOVENIA.replace("20273.0", area);
        assertThat(mapper.detail(json.readValue(source, Country.class)).populationDensity()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"codes\":{}}", "{\"codes\":{\"alpha_3\":\"SI\"}}",
            "{\"codes\":{\"alpha_3\":\"svn\"}}", "{\"codes\":{\"alpha_3\":\"123\"}}"})
    void excludesInvalidIdentifiers(String source) {
        assertThat(mapper.summary(json.readValue(source, Country.class))).isEmpty();
    }
}

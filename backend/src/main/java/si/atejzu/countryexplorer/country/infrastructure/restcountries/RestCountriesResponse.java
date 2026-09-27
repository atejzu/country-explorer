package si.atejzu.countryexplorer.country.infrastructure.restcountries;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RestCountriesResponse(Data data) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Data(List<Country> objects, Meta meta) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Meta(Integer total, Integer count, Integer limit, Integer offset, Boolean more) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Country(Codes codes, Names names, List<Capital> capitals, Long population,
            String region, String subregion, Area area, Coordinates coordinates,
            List<Currency> currencies, List<Language> languages, List<String> timezones,
            List<String> borders, @JsonProperty("calling_codes") List<String> callingCodes,
            Cars cars, Flag flag) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Codes(@JsonProperty("alpha_2") String alpha2, @JsonProperty("alpha_3") String alpha3) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Names(String common, String official, @JsonProperty("native") Map<String, Translation> nativeNames) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Translation(String common, String official) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Capital(String name, Attributes attributes) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Attributes(Boolean primary) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Area(BigDecimal kilometers) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Coordinates(BigDecimal lat, BigDecimal lng) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Currency(String code, String name, String symbol) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Language(String bcp47, String name) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Cars(@JsonProperty("driving_side") String drivingSide) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Flag(@JsonProperty("url_png") String png, @JsonProperty("url_svg") String svg) {}
}

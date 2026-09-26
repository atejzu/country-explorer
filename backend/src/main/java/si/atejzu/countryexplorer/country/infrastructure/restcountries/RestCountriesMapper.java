package si.atejzu.countryexplorer.country.infrastructure.restcountries;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;
import java.util.MissingResourceException;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import si.atejzu.countryexplorer.country.application.CountryServiceUnavailableException;
import si.atejzu.countryexplorer.country.domain.CountryDetail;
import si.atejzu.countryexplorer.country.domain.CountrySummary;
import si.atejzu.countryexplorer.country.infrastructure.restcountries.RestCountriesResponse.Country;

@Component
public class RestCountriesMapper {
    private static final Logger log = LoggerFactory.getLogger(RestCountriesMapper.class);

    public Optional<CountrySummary> summary(Country source) {
        if (source == null || source.codes() == null || source.codes().alpha3() == null
                || !source.codes().alpha3().matches("[A-Z]{3}")) {
            log.warn("Skipping country record without a supported alpha-3 identifier");
            return Optional.empty();
        }
        var names = source.names();
        var translation = names == null || names.translations() == null ? null : names.translations().get("slv");
        String canonical = names == null ? null : names.common();
        String official = names == null ? null : names.official();
        String display = fallback(translation == null ? null : translation.common(), canonical);
        if (display == null || display.isBlank()) {
            log.warn("Country response has no usable display name");
            throw new CountryServiceUnavailableException();
        }
        String displayOfficial = fallback(translation == null ? null : translation.official(), official);
        var capitals = values(source.capitals()).stream().filter(c -> c.name() != null && !c.name().isBlank()).toList();
        String capital = capitals.stream().filter(c -> c.attributes() != null && Boolean.TRUE.equals(c.attributes().primary()))
                .findFirst().or(() -> capitals.stream().findFirst()).map(RestCountriesResponse.Capital::name).orElse(null);
        var flag = source.flag();
        return Optional.of(new CountrySummary(source.codes().alpha3(), display, displayOfficial, canonical, official,
                capital, source.population(), source.region(), new CountryDetail.Flag(
                        flag == null ? null : flag.png(), flag == null ? null : flag.svg(), "Zastava države " + display)));
    }

    public CountryDetail detail(Country source) {
        var summary = summary(source).orElseThrow(CountryServiceUnavailableException::new);
        BigDecimal area = source.area() == null ? null : source.area().kilometers();
        BigDecimal density = area != null && area.signum() > 0 && source.population() != null
                ? BigDecimal.valueOf(source.population()).divide(area, 2, RoundingMode.HALF_UP) : null;
        var coordinates = source.coordinates();
        return new CountryDetail(summary.code(), summary.name(), summary.officialName(),
                strings(values(source.capitals()).stream().map(RestCountriesResponse.Capital::name).toList()),
                source.population(), area, density, source.region(), source.subregion(),
                values(source.currencies()).stream().map(c -> new CountryDetail.Currency(c.code(), c.name(), c.symbol())).toList(),
                values(source.languages()).stream().map(l -> new CountryDetail.Language(languageCode(l.bcp47()), l.name())).toList(),
                strings(source.timezones()), strings(source.borders()), strings(source.callingCodes()).stream()
                        .map(String::trim).map(c -> c.startsWith("+") ? c : "+" + c).toList(),
                source.cars() == null ? null : source.cars().drivingSide(),
                coordinates == null ? null : new CountryDetail.Coordinates(coordinates.lat(), coordinates.lng()), summary.flag());
    }

    // The documented v5 language BCP 47 tag supplies a stable ISO 639-3 application code.
    private String languageCode(String tag) {
        if (tag == null || tag.isBlank()) return null;
        try {
            return Locale.forLanguageTag(tag).getISO3Language();
        } catch (MissingResourceException e) {
            return tag;
        }
    }

    private String fallback(String preferred, String canonical) {
        return preferred == null || preferred.isBlank() ? canonical : preferred;
    }

    private static <T> List<T> values(List<T> source) {
        return source == null ? List.of() : source.stream().filter(Objects::nonNull).toList();
    }

    private static List<String> strings(List<String> source) {
        return values(source).stream().filter(s -> !s.isBlank()).toList();
    }
}

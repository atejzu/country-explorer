package si.atejzu.countryexplorer.country.domain;

import java.math.BigDecimal;
import java.util.List;

public record CountryDetail(String code, String name, String officialName, List<String> capital,
        Long population, BigDecimal area, BigDecimal populationDensity, String region, String subregion,
        List<Currency> currencies, List<Language> languages, List<String> timezones, List<String> borders,
        List<String> callingCodes, String drivingSide, Coordinates coordinates, Flag flag) {
    public record Currency(String code, String name, String symbol) {}
    public record Language(String code, String name) {}
    public record Coordinates(BigDecimal latitude, BigDecimal longitude) {}
    public record Flag(String png, String svg, String alt) {}
}

package si.atejzu.countryexplorer.country.api;

import java.math.BigDecimal;
import java.util.List;

public record CountryDetailResponse(String code, String name, String officialName, List<String> capital,
        Long population, BigDecimal area, BigDecimal populationDensity, String region, String subregion,
        List<CurrencyResponse> currencies, List<LanguageResponse> languages, List<String> timezones,
        List<String> borders, List<String> callingCodes, String drivingSide,
        CoordinatesResponse coordinates, FlagResponse flag) {
    public record CurrencyResponse(String code, String name, String symbol) {}
    public record LanguageResponse(String code, String name) {}
    public record CoordinatesResponse(BigDecimal latitude, BigDecimal longitude) {}
    public record FlagResponse(String png, String svg, String alt) {}
}

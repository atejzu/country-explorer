package si.atejzu.countryexplorer.country.api;

public record CountrySummaryResponse(String code, String name, String capital, Long population,
        String region, CountryDetailResponse.FlagResponse flag) {}

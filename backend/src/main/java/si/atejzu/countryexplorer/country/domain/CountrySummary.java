package si.atejzu.countryexplorer.country.domain;

public record CountrySummary(String code, String name, String officialName,
        String canonicalName, String canonicalOfficialName, String capital,
        Long population, String region, CountryDetail.Flag flag) {}

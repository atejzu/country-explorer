package si.atejzu.countryexplorer.country.application;

import java.util.List;
import java.util.Locale;
import si.atejzu.countryexplorer.common.error.InvalidQueryParameterException;

public record CountryQuery(String search, String region, String sort, String direction) {
    private static final List<String> REGIONS = List.of("Africa", "Americas", "Asia", "Europe", "Oceania", "Antarctic");

    public CountryQuery {
        search = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
        if (region != null) {
            String input = region;
            region = REGIONS.stream().filter(r -> r.equalsIgnoreCase(input)).findFirst()
                    .orElseThrow(() -> new InvalidQueryParameterException("region"));
        }
        sort = sort == null ? "name" : sort;
        direction = direction == null ? "asc" : direction;
        if (!List.of("name", "population").contains(sort)) throw new InvalidQueryParameterException("sort");
        if (!List.of("asc", "desc").contains(direction)) throw new InvalidQueryParameterException("direction");
    }
}

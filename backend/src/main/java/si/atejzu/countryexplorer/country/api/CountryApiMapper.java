package si.atejzu.countryexplorer.country.api;

import org.springframework.stereotype.Component;
import si.atejzu.countryexplorer.country.domain.CountryDetail;
import si.atejzu.countryexplorer.country.domain.CountrySummary;
import si.atejzu.countryexplorer.country.api.CountryDetailResponse.*;

@Component
public class CountryApiMapper {
    public CountrySummaryResponse summary(CountrySummary country) {
        return new CountrySummaryResponse(country.code(), country.name(), country.capital(),
                country.population(), country.region(), flag(country.flag()));
    }

    public CountryDetailResponse detail(CountryDetail country) {
        var coordinates = country.coordinates();
        return new CountryDetailResponse(country.code(), country.name(), country.officialName(), country.capital(),
                country.population(), country.area(), country.populationDensity(), country.region(), country.subregion(),
                country.currencies().stream().map(c -> new CurrencyResponse(c.code(), c.name(), c.symbol())).toList(),
                country.languages().stream().map(l -> new LanguageResponse(l.code(), l.name())).toList(),
                country.timezones(), country.borders(), country.callingCodes(), country.drivingSide(),
                coordinates == null ? null : new CoordinatesResponse(coordinates.latitude(), coordinates.longitude()), flag(country.flag()));
    }

    private FlagResponse flag(CountryDetail.Flag flag) {
        return new FlagResponse(flag.png(), flag.svg(), flag.alt());
    }
}

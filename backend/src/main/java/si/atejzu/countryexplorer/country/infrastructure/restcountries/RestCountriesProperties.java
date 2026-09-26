package si.atejzu.countryexplorer.country.infrastructure.restcountries;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.rest-countries")
public record RestCountriesProperties(
        @DefaultValue("https://api.restcountries.com/countries/v5") String baseUrl,
        @DefaultValue("") String apiKey,
        @DefaultValue("2s") Duration connectTimeout,
        @DefaultValue("5s") Duration readTimeout) {
    @Override
    public String toString() {
        return "RestCountriesProperties[credentials redacted]";
    }
}

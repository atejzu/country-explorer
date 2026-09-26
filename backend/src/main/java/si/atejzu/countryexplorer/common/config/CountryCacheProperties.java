package si.atejzu.countryexplorer.common.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.country-cache")
public record CountryCacheProperties(@DefaultValue("24h") Duration catalogueTtl,
        @DefaultValue("24h") Duration detailsTtl, @DefaultValue("300") long detailsMaximumSize) {}

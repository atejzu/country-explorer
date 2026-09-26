package si.atejzu.countryexplorer.country.infrastructure.restcountries;

import java.net.http.HttpClient;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriBuilder;
import si.atejzu.countryexplorer.country.application.CountryNotFoundException;
import si.atejzu.countryexplorer.country.application.CountryServiceUnavailableException;
import si.atejzu.countryexplorer.country.domain.CountryDetail;
import si.atejzu.countryexplorer.country.domain.CountrySummary;

@Component
@EnableConfigurationProperties(RestCountriesProperties.class)
public class RestCountriesClient {
    private static final Logger log = LoggerFactory.getLogger(RestCountriesClient.class);
    static final String CATALOG_FIELDS = "codes.alpha_3,names.common,names.official,names.translations.slv,capitals,population,region,flag.url_png,flag.url_svg";
    private static final int PAGE_SIZE = 100;
    private final RestClient http;
    private final RestCountriesProperties properties;
    private final RestCountriesMapper mapper;

    public RestCountriesClient(RestCountriesProperties properties, RestCountriesMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        var client = HttpClient.newBuilder().connectTimeout(properties.connectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER).build();
        var factory = new JdkClientHttpRequestFactory(client);
        factory.setReadTimeout(properties.readTimeout());
        this.http = RestClient.builder().baseUrl(properties.baseUrl()).requestFactory(factory).build();
    }

    public List<CountrySummary> catalogue() {
        var result = new ArrayList<CountrySummary>();
        var codes = new HashSet<String>();
        int offset = 0;
        Integer total = null;
        // A finite guard also prevents a broken upstream from consuming unbounded quota.
        for (int page = 0; page < 100; page++) {
            int requestedOffset = offset;
            var data = request(uri -> uri.queryParam("limit", PAGE_SIZE).queryParam("offset", requestedOffset)
                    .queryParam("response_fields", CATALOG_FIELDS)).data();
            var meta = data.meta();
            if (meta == null || meta.total() == null || meta.count() == null || meta.offset() == null
                    || meta.limit() == null || meta.more() == null || meta.offset() != offset
                    || meta.count() != data.objects().size() || meta.count() > PAGE_SIZE || meta.total() < 0
                    || meta.limit() < 1 || meta.limit() > PAGE_SIZE || meta.count() > meta.limit()
                    || (total != null && !total.equals(meta.total()))) {
                throw unusable("Invalid catalogue pagination metadata");
            }
            total = meta.total();
            long nextOffset = (long) offset + meta.count();
            if (nextOffset > total || meta.more() != (nextOffset < total) || (meta.more() && meta.count() == 0)) {
                throw unusable("Inconsistent catalogue pagination");
            }
            for (var record : data.objects()) {
                mapper.summary(record).ifPresent(country -> {
                    if (!codes.add(country.code())) throw unusable("Duplicate country in catalogue");
                    result.add(country);
                });
            }
            if (!meta.more()) {
                if (result.isEmpty()) throw unusable("Empty usable catalogue");
                return List.copyOf(result);
            }
            offset = (int) nextOffset;
        }
        throw unusable("Catalogue pagination exceeded safety limit");
    }

    public CountryDetail detail(String code) {
        var data = request(uri -> uri.path("/codes.alpha_3/{code}"), code).data();
        if (data.objects().isEmpty()) throw new CountryNotFoundException();
        if (data.objects().size() != 1) throw unusable("Exact lookup returned multiple records");
        var detail = mapper.detail(data.objects().getFirst());
        if (!detail.code().equals(code)) throw unusable("Exact lookup returned a different country");
        return detail;
    }

    private RestCountriesResponse request(Function<UriBuilder, UriBuilder> uri, Object... variables) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            throw unusable("Country integration API key is not configured");
        }
        try {
            var response = http.get().uri(builder -> uri.apply(builder).build(variables))
                    .headers(headers -> headers.setBearerAuth(properties.apiKey()))
                    .accept(MediaType.APPLICATION_JSON).retrieve().body(RestCountriesResponse.class);
            if (response == null || response.data() == null || response.data().objects() == null) {
                throw unusable("Missing country response envelope");
            }
            return response;
        } catch (RestClientResponseException e) {
            // Never log response bodies, headers or exception messages: they may contain credentials/account data.
            log.warn("Country upstream HTTP failure: status={}", e.getStatusCode().value());
            throw new CountryServiceUnavailableException();
        } catch (RestClientException | IllegalArgumentException e) {
            log.warn("Country upstream transport or decoding failure: category={}", e.getClass().getSimpleName());
            throw new CountryServiceUnavailableException();
        }
    }

    private static CountryServiceUnavailableException unusable(String diagnostic) {
        log.warn("{}", diagnostic);
        return new CountryServiceUnavailableException();
    }
}

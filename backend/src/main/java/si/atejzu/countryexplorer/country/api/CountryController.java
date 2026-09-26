package si.atejzu.countryexplorer.country.api;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import si.atejzu.countryexplorer.country.application.CountryQuery;
import si.atejzu.countryexplorer.country.application.CountryService;

@RestController
@RequestMapping("/api/v1/countries")
public class CountryController {
    private final CountryService service;
    private final CountryApiMapper mapper;

    public CountryController(CountryService service, CountryApiMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @GetMapping
    public List<CountrySummaryResponse> list(@RequestParam(required = false) String search,
            @RequestParam(required = false) String region, @RequestParam(required = false) String sort,
            @RequestParam(required = false) String direction) {
        return service.list(new CountryQuery(search, region, sort, direction)).stream().map(mapper::summary).toList();
    }

    @GetMapping("/{countryCode}")
    public CountryDetailResponse detail(@PathVariable String countryCode) {
        return mapper.detail(service.detail(countryCode));
    }
}

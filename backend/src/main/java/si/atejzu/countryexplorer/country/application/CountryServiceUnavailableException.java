package si.atejzu.countryexplorer.country.application;

public class CountryServiceUnavailableException extends RuntimeException {
    public CountryServiceUnavailableException() {
        super("Country data is temporarily unavailable.");
    }
}

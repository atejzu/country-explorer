package si.atejzu.countryexplorer.country.application;

public class CountryNotFoundException extends RuntimeException {
    public CountryNotFoundException() {
        super("Country not found.");
    }
}

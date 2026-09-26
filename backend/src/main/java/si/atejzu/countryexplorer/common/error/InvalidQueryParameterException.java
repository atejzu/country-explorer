package si.atejzu.countryexplorer.common.error;

public class InvalidQueryParameterException extends RuntimeException {
    public InvalidQueryParameterException(String parameter) {
        super("Invalid query parameter: " + parameter + ".");
    }
}

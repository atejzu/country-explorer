package si.atejzu.countryexplorer.auth.application;

public class RegistrationConflictException extends RuntimeException {
    public enum Field { USERNAME, EMAIL }

    private final Field field;

    public RegistrationConflictException(Field field) {
        super("The " + field.name().toLowerCase(java.util.Locale.ROOT) + " is already registered.");
        this.field = field;
    }

    public Field field() { return field; }
}

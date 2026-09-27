package si.atejzu.countryexplorer.common.api;

import org.springframework.data.domain.PageRequest;
import si.atejzu.countryexplorer.common.error.InvalidQueryParameterException;

public final class PageQuery {
    private PageQuery() {}

    public static PageRequest parse(String page, String size, int maximumSize) {
        int pageNumber = number(page, "page");
        int pageSize = number(size, "size");
        if (pageNumber < 0) throw new InvalidQueryParameterException("page");
        if (pageSize < 1 || pageSize > maximumSize) throw new InvalidQueryParameterException("size");
        // JPA offsets are integers even though Pageable computes them as longs.
        if ((long) pageNumber * pageSize > Integer.MAX_VALUE) throw new InvalidQueryParameterException("page");
        return PageRequest.of(pageNumber, pageSize);
    }

    private static int number(String value, String parameter) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            throw new InvalidQueryParameterException(parameter);
        }
    }
}

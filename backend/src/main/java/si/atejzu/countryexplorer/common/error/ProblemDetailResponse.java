package si.atejzu.countryexplorer.common.error;

public record ProblemDetailResponse(String type, String title, int status, String detail, String instance, String code) {}

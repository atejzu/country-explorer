package si.atejzu.countryexplorer.discussion.application;

public class DiscussionNotFoundException extends RuntimeException {
    public DiscussionNotFoundException() { super("Discussion not found."); }
}

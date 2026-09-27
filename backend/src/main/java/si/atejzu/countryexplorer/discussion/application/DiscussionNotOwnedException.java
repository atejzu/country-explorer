package si.atejzu.countryexplorer.discussion.application;

public class DiscussionNotOwnedException extends RuntimeException {
    public DiscussionNotOwnedException() { super("You do not own this discussion."); }
}

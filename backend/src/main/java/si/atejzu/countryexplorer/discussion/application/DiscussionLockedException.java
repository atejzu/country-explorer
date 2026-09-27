package si.atejzu.countryexplorer.discussion.application;

public class DiscussionLockedException extends RuntimeException {
    public DiscussionLockedException() { super("This discussion can no longer be modified because it has received a comment."); }
}

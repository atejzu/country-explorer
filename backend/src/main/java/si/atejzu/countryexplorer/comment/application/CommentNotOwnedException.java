package si.atejzu.countryexplorer.comment.application;

public class CommentNotOwnedException extends RuntimeException {
    public CommentNotOwnedException() { super("You do not own this comment."); }
}

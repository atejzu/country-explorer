package si.atejzu.countryexplorer.comment.application;

public class CommentNotFoundException extends RuntimeException {
    public CommentNotFoundException() { super("Comment not found."); }
}

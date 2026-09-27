package si.atejzu.countryexplorer.comment.application;

import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import si.atejzu.countryexplorer.common.api.PageResponse;
import si.atejzu.countryexplorer.comment.api.CommentResponse;
import si.atejzu.countryexplorer.comment.api.CreateCommentRequest;
import si.atejzu.countryexplorer.comment.api.UpdateCommentRequest;
import si.atejzu.countryexplorer.comment.domain.Comment;
import si.atejzu.countryexplorer.comment.persistence.CommentRepository;
import si.atejzu.countryexplorer.discussion.application.DiscussionNotFoundException;
import si.atejzu.countryexplorer.discussion.persistence.DiscussionRepository;

@Service
public class CommentService {
    private final CommentRepository comments;
    private final DiscussionRepository discussions;

    public CommentService(CommentRepository comments, DiscussionRepository discussions) {
        this.comments = comments;
        this.discussions = discussions;
    }

    @Transactional(readOnly = true)
    public PageResponse<CommentResponse> list(UUID discussionId, Pageable page) {
        if (!discussions.existsById(discussionId)) throw new DiscussionNotFoundException();
        return PageResponse.from(comments.responses(discussionId, page));
    }

    @Transactional
    public CommentResponse createComment(UUID discussionId, UUID userId, CreateCommentRequest request) {
        var discussion = discussions.findByIdForUpdate(discussionId).orElseThrow(DiscussionNotFoundException::new);
        var comment = comments.save(new Comment(discussionId, userId, request.body()));
        discussion.receiveComment();
        // Both changes flush and commit together. Any failure rolls back the lifecycle transition too.
        comments.flush();
        return response(comment.getId());
    }

    @Transactional
    public CommentResponse updateComment(UUID id, UUID userId, UpdateCommentRequest request) {
        owned(id, userId).edit(request.body());
        comments.flush();
        return response(id);
    }

    @Transactional
    public void deleteComment(UUID id, UUID userId) {
        comments.delete(owned(id, userId));
    }

    private Comment owned(UUID id, UUID userId) {
        var comment = comments.findById(id).orElseThrow(CommentNotFoundException::new);
        if (!comment.getAuthorId().equals(userId)) throw new CommentNotOwnedException();
        return comment;
    }

    private CommentResponse response(UUID id) {
        return comments.response(id).orElseThrow(CommentNotFoundException::new);
    }
}

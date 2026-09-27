package si.atejzu.countryexplorer.comment.persistence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import si.atejzu.countryexplorer.comment.api.CommentResponse;
import si.atejzu.countryexplorer.comment.domain.Comment;

public interface CommentRepository extends JpaRepository<Comment, UUID> {
    @Query(value = """
            select new si.atejzu.countryexplorer.comment.api.CommentResponse(
                c.id, c.discussionId, u.id, u.username, c.body, c.createdAt, c.updatedAt)
            from Comment c join UserAccount u on u.id = c.authorId
            where c.discussionId = :discussionId order by c.createdAt asc, c.id asc
            """, countQuery = "select count(c) from Comment c where c.discussionId = :discussionId")
    Page<CommentResponse> responses(UUID discussionId, Pageable pageable);

    @Query("""
            select new si.atejzu.countryexplorer.comment.api.CommentResponse(
                c.id, c.discussionId, u.id, u.username, c.body, c.createdAt, c.updatedAt)
            from Comment c join UserAccount u on u.id = c.authorId where c.id = :id
            """)
    Optional<CommentResponse> response(UUID id);
}

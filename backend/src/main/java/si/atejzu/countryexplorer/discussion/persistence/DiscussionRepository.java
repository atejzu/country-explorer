package si.atejzu.countryexplorer.discussion.persistence;

import java.util.Optional;
import java.util.UUID;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import si.atejzu.countryexplorer.discussion.api.DiscussionResponse;
import si.atejzu.countryexplorer.discussion.api.DiscussionSummaryResponse;
import si.atejzu.countryexplorer.discussion.domain.Discussion;

public interface DiscussionRepository extends JpaRepository<Discussion, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Discussion d where d.id = :id")
    Optional<Discussion> findByIdForUpdate(UUID id);

    // One content query includes public authors and indexed counts; no per-item round trips.
    @Query(value = """
            select new si.atejzu.countryexplorer.discussion.api.DiscussionSummaryResponse(
                d.id, d.title, u.id, u.username, d.countryCode,
                (select count(c) from Comment c where c.discussionId = d.id),
                d.hasReceivedComments, d.createdAt, d.updatedAt)
            from Discussion d join UserAccount u on u.id = d.authorId
            where d.countryCode = :countryCode order by d.createdAt desc, d.id desc
            """, countQuery = "select count(d) from Discussion d where d.countryCode = :countryCode")
    Page<DiscussionSummaryResponse> summaries(String countryCode, Pageable pageable);

    @Query("""
            select new si.atejzu.countryexplorer.discussion.api.DiscussionResponse(
                d.id, d.title, d.body, u.id, u.username, d.countryCode,
                (select count(c) from Comment c where c.discussionId = d.id),
                d.hasReceivedComments, d.createdAt, d.updatedAt)
            from Discussion d join UserAccount u on u.id = d.authorId where d.id = :id
            """)
    Optional<DiscussionResponse> detail(UUID id);
}

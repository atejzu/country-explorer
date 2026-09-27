package si.atejzu.countryexplorer;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionTemplate;
import si.atejzu.countryexplorer.comment.api.CreateCommentRequest;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CommunityConcurrencyTest extends CommunityTestSupport {
    @ParameterizedTest(name = "{0} holds lock before {1}")
    @CsvSource({"DELETE,COMMENT,204,404", "COMMENT,DELETE,201,409",
            "EDIT,COMMENT,200,201", "COMMENT,EDIT,201,409", "COMMENT,COMMENT,201,201"})
    void realRequestsSerializeOnSamePostgresRow(String winner, String contender, int winnerStatus, int contenderStatus) throws Exception {
        UUID id = UUID.fromString(discussion().path("id").asText());
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var backendPid = new AtomicInteger();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var firstRequest = executor.submit(() -> new TransactionTemplate(transactions).execute(transaction -> {
                // Test owns the outer transaction solely to control commit timing. Production services
                // join it and execute their own findByIdForUpdate and all normal business logic.
                discussions.findByIdForUpdate(id).orElseThrow();
                backendPid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
                try {
                    var result = operation(winner, id, false);
                    locked.countDown();
                    assertThat(release.await(15, TimeUnit.SECONDS)).isTrue();
                    return result;
                } catch (Exception exception) { throw new RuntimeException(exception); }
            }));
            assertThat(locked.await(15, TimeUnit.SECONDS)).isTrue();
            var secondRequest = executor.submit(() -> operation(contender, id, true));
            // Prove actual overlapping transactions and a PostgreSQL lock wait, not sequential calls
            // or a scheduler assumption. No production hooks or sleeps are involved.
            await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(jdbc.queryForObject("""
                    select count(*) from pg_stat_activity
                    where wait_event_type = 'Lock' and ? = any(pg_blocking_pids(pid))
                    """, Long.class, backendPid.get())).isGreaterThan(0));
            assertThat(secondRequest.isDone()).isFalse();
            release.countDown();
            assertThat(firstRequest.get(15, TimeUnit.SECONDS)).isEqualTo(winnerStatus);
            assertThat(secondRequest.get(15, TimeUnit.SECONDS)).isEqualTo(contenderStatus);
        } finally {
            release.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(20, TimeUnit.SECONDS)).isTrue();
        }
        if (winner.equals("DELETE")) {
            assertThat(discussions.existsById(id)).isFalse();
            assertThat(count("comments")).isZero();
        } else {
            var saved = discussions.findById(id).orElseThrow();
            assertThat(saved.hasReceivedComments()).isTrue();
            assertThat(saved.getTitle()).isEqualTo(winner.equals("EDIT") ? "Edited before comment" : "Travel advice");
            long expected = winner.equals("COMMENT") && contender.equals("COMMENT") ? 2 : 1;
            assertThat(count("comments")).isEqualTo(expected);
            mvc.perform(get(DISCUSSIONS + id)).andExpect(jsonPath("$.locked").value(true))
                    .andExpect(jsonPath("$.commentCount").value(expected));
            if (expected == 2) assertThat(jdbc.queryForList("select author_id from comments", UUID.class))
                    .containsExactlyInAnyOrder(first.userId(), second.userId());
        }
    }

    @Test
    void genuineForeignKeyFailureRollsBackCommentAndLifecycleTogether() throws Exception {
        UUID id = UUID.fromString(discussion().path("id").asText());
        var before = discussions.findById(id).orElseThrow();
        // A missing author fails the real FK at flush after the production discussion lock.
        assertThatThrownBy(() -> comments.createComment(id, UUID.randomUUID(), new CreateCommentRequest("Valid content")))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(count("comments")).isZero();
        var after = discussions.findById(id).orElseThrow();
        assertThat(after.hasReceivedComments()).isFalse();
        assertThat(after.getUpdatedAt()).isEqualTo(before.getUpdatedAt());
        mvc.perform(get(DISCUSSIONS + id)).andExpect(jsonPath("$.locked").value(false)).andExpect(jsonPath("$.commentCount").value(0));
    }

    @Test
    void persistenceFailureAtHttpBoundaryIsSanitizedAndDoesNotLock() throws Exception {
        String id = discussion().path("id").asText();
        var stalePrincipal = new si.atejzu.countryexplorer.common.security.AppUserPrincipal(UUID.randomUUID(), "stale", "unused@example.test", null);
        mutate("POST", DISCUSSIONS + id + "/comments", stalePrincipal, "{\"body\":\"Valid content\"}")
                .andExpect(problem(500, "INTERNAL_ERROR"));
        assertThat(count("comments")).isZero();
        assertThat(discussions.findById(UUID.fromString(id)).orElseThrow().hasReceivedComments()).isFalse();
    }

    private int operation(String operation, UUID id, boolean otherUser) throws Exception {
        var result = switch (operation) {
            case "COMMENT" -> mutate("POST", DISCUSSIONS + id + "/comments", otherUser ? second : first, "{\"body\":\"Concurrent comment\"}");
            case "EDIT" -> mutate("PATCH", DISCUSSIONS + id, first, "{\"title\":\"Edited before comment\"}");
            case "DELETE" -> mutate("DELETE", DISCUSSIONS + id, first, null);
            default -> throw new IllegalArgumentException();
        };
        int status = result.andReturn().getResponse().getStatus();
        if (status == 404) result.andExpect(problem(404, "DISCUSSION_NOT_FOUND"));
        if (status == 409) result.andExpect(problem(409, "DISCUSSION_LOCKED"));
        return status;
    }
}

package si.atejzu.countryexplorer;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import si.atejzu.countryexplorer.country.application.CountryService;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CommunityIntegrationTest extends CommunityTestSupport {
    @MockitoSpyBean CountryService countries;
    @Autowired EntityManagerFactory entityManagers;

    @Test
    void creationAndPublicReadsHaveExactSafeShapesAndNoExternalCallInTransaction() throws Exception {
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return invocation.callRealMethod();
        }).when(countries).summaries(any());
        var result = mutate("POST", COUNTRIES.replace("SVN", "svn"), first,
                mapper.writeValueAsString(Map.of("title", "Travel advice", "body", "Original body",
                        "authorId", second.userId(), "userId", second.userId(), "locked", true))).andExpect(status().isCreated());
        var created = json(result);
        String id = created.path("id").asText();
        result.andExpect(header().string("Location", DISCUSSIONS + id));
        assertThat(created.propertyNames()).containsExactlyInAnyOrder("id", "title", "body", "author", "countryCode",
                "commentCount", "locked", "createdAt", "updatedAt");
        assertThat(created.path("createdAt")).isEqualTo(created.path("updatedAt"));
        assertThat(created.path("author").propertyNames()).containsExactlyInAnyOrder("id", "username");
        assertThat(created.path("author").path("id").asText()).isEqualTo(first.userId().toString());
        assertThat(created.path("author").path("username").asText()).isEqualTo("first");
        assertThat(created.path("countryCode").asText()).isEqualTo("SVN");
        assertCountAndLock(id, 0, false);
        mvc.perform(get(DISCUSSIONS + id)).andExpect(status().isOk()).andExpect(content().json(created.toString()));
        for (boolean authenticated : new boolean[] {false, true}) {
            var request = get(COUNTRIES);
            if (authenticated) request.with(user(second));
            var page = json(mvc.perform(request).andExpect(status().isOk()));
            assertThat(page.propertyNames()).containsExactlyInAnyOrder("items", "page", "size", "totalItems", "totalPages");
            assertThat(page.path("size").asInt()).isEqualTo(10);
            assertThat(page.path("items").get(0).propertyNames()).containsExactlyInAnyOrder("id", "title", "author",
                    "countryCode", "commentCount", "locked", "createdAt", "updatedAt");
            assertSafe(page.toString());
        }
        assertSafe(created.toString());
    }

    @ParameterizedTest
    @CsvSource({"POST,country", "PATCH,discussion", "DELETE,discussion", "POST,comments", "PATCH,comment", "DELETE,comment"})
    void allMutationsEnforceAuthenticationAndRealCookieCsrf(String method, String resource) throws Exception {
        String path = path(resource, UUID.randomUUID().toString());
        mutate(method, path, null, "{}").andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
        mvc.perform(request(HttpMethod.valueOf(method), path).with(user(first)).contentType("application/json").content("{}"))
                .andExpect(problem(403, "ACCESS_DENIED"));
    }

    @ParameterizedTest @ValueSource(strings = {"ZZZ", "SI", "123", "ſvn"})
    void countryMustExistAndFailuresCreateNothing(String code) throws Exception {
        mutate("POST", COUNTRIES.replace("SVN", code), first, "{\"title\":\"Valid title\",\"body\":\"Body\"}")
                .andExpect(problem(404, "COUNTRY_NOT_FOUND"));
        assertThat(count("discussions")).isZero();
    }

    @Test
    void unavailableCountryCatalogueCreatesNothing() throws Exception {
        unavailable();
        mutate("POST", COUNTRIES, first, "{\"title\":\"Valid title\",\"body\":\"Body\"}")
                .andExpect(problem(503, "COUNTRY_SERVICE_UNAVAILABLE"));
        assertThat(count("discussions")).isZero();
    }

    static Stream<String> invalidDiscussions() {
        return Stream.of("{}", "{\"body\":\"body\"}", "{\"title\":\"Valid title\"}",
                "{\"title\":null,\"body\":\"body\"}", "{\"title\":\"    \",\"body\":\"body\"}",
                "{\"title\":\"abcd\",\"body\":\"body\"}", "{\"title\":\"Valid title\",\"body\":\"  \"}",
                "{\"title\":\"" + "a".repeat(151) + "\",\"body\":\"body\"}",
                "{\"title\":\"Valid title\",\"body\":\"" + "a".repeat(5001) + "\"}");
    }
    @ParameterizedTest @MethodSource("invalidDiscussions")
    void invalidDiscussionCreateIsValidationFailure(String body) throws Exception {
        mutate("POST", COUNTRIES, first, body).andExpect(problem(400, "VALIDATION_FAILED"));
        assertThat(count("discussions")).isZero();
    }

    static Stream<String> invalidPatches() {
        return Stream.of("{}", "{\"title\":null}", "{\"body\":null}", "{\"title\":\"abcd\"}",
                "{\"title\":\"     \"}", "{\"body\":\" \"}", "{\"locked\":false}",
                "{\"title\":\"Valid title\",\"body\":null}",
                "{\"title\":\"" + "a".repeat(151) + "\"}", "{\"body\":\"" + "a".repeat(5001) + "\"}");
    }
    @ParameterizedTest @MethodSource("invalidPatches")
    void invalidDiscussionPatchCannotChangeState(String body) throws Exception {
        var original = discussion();
        mutate("PATCH", DISCUSSIONS + original.path("id").asText(), first, body).andExpect(problem(400, "VALIDATION_FAILED"));
        mvc.perform(get(DISCUSSIONS + original.path("id").asText())).andExpect(content().json(original.toString()));
    }

    @ParameterizedTest @ValueSource(strings = {"{\"title\":\"Updated title\"}", "{\"body\":\"Updated body\"}",
            "{\"title\":\"Updated title\",\"body\":\"Updated body\"}"})
    void unlockedOwnerMayPatchSuppliedFieldsAndTimestamp(String patch) throws Exception {
        var original = discussion();
        var updated = json(mutate("PATCH", DISCUSSIONS + original.path("id").asText(), first, patch).andExpect(status().isOk()));
        var fields = mapper.readTree(patch);
        for (String field : new String[] {"title", "body"})
            assertThat(updated.path(field)).isEqualTo(fields.has(field) ? fields.path(field) : original.path(field));
        assertThat(updated.path("createdAt")).isEqualTo(original.path("createdAt"));
        assertThat(Instant.parse(updated.path("updatedAt").asText())).isAfter(Instant.parse(original.path("updatedAt").asText()));
    }

    @Test
    void immutableDiscussionFieldsAreIgnoredAndNeverBound() throws Exception {
        var original = discussion();
        var patch = mapper.writeValueAsString(Map.of("title", "Updated title", "id", UUID.randomUUID(),
                "authorId", second.userId(), "userId", second.userId(), "countryCode", "ITA", "createdAt", "2000-01-01T00:00:00Z",
                "hasReceivedComments", true, "locked", true, "commentCount", 99));
        var updated = json(mutate("PATCH", DISCUSSIONS + original.path("id").asText(), first, patch).andExpect(status().isOk()));
        for (String field : new String[] {"id", "author", "countryCode", "createdAt", "locked", "commentCount"})
            assertThat(updated.path(field)).isEqualTo(original.path(field));
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void ownershipPrecedesLockAndNonOwnerCannotMutate(boolean locked) throws Exception {
        String id = discussion().path("id").asText();
        if (locked) comment(id, second);
        var before = json(mvc.perform(get(DISCUSSIONS + id)));
        mutate("PATCH", DISCUSSIONS + id, second, "{\"title\":\"Changed title\"}").andExpect(problem(403, "DISCUSSION_NOT_OWNED"));
        mutate("DELETE", DISCUSSIONS + id, second, null).andExpect(problem(403, "DISCUSSION_NOT_OWNED"));
        mvc.perform(get(DISCUSSIONS + id)).andExpect(content().json(before.toString()));
    }

    @Test
    void ownerCanDeleteUnlockedDiscussion() throws Exception {
        mutate("DELETE", DISCUSSIONS + discussion().path("id").asText(), first, null)
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        assertThat(count("discussions")).isZero();
    }

    @ParameterizedTest
    @CsvSource({"GET,discussion,DISCUSSION_NOT_FOUND", "PATCH,discussion,DISCUSSION_NOT_FOUND", "DELETE,discussion,DISCUSSION_NOT_FOUND",
            "GET,comments,DISCUSSION_NOT_FOUND", "POST,comments,DISCUSSION_NOT_FOUND", "PATCH,comment,COMMENT_NOT_FOUND", "DELETE,comment,COMMENT_NOT_FOUND"})
    void missingResourcesReturnDomain404(String method, String resource, String code) throws Exception {
        String path = path(resource, UUID.randomUUID().toString());
        String body = resource.equals("discussion") ? "{\"title\":\"Valid title\"}" : "{\"body\":\"Valid body\"}";
        if (method.equals("GET")) mvc.perform(get(path)).andExpect(problem(404, code));
        else mutate(method, path, first, body).andExpect(problem(404, code));
    }

    @ParameterizedTest
    @CsvSource({"GET,discussion", "GET,comments", "PATCH,discussion", "DELETE,discussion",
            "POST,comments", "PATCH,comment", "DELETE,comment"})
    void malformedUuidPathsReturnSafeValidationProblems(String method, String resource) throws Exception {
        String path = path(resource, "not-a-uuid");
        String body = resource.equals("discussion") ? "{\"title\":\"Valid title\"}" : "{\"body\":\"Valid body\"}";
        var result = method.equals("GET") ? mvc.perform(get(path)) : mutate(method, path, first, body);
        result.andExpect(problem(400, "VALIDATION_FAILED"))
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.title").value("Validation failed"))
                .andExpect(jsonPath("$.detail").value("The resource identifier is invalid."))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
        assertThat(result.andReturn().getResolvedException()).isInstanceOf(MethodArgumentTypeMismatchException.class);
        assertThat(json(result).propertyNames()).containsExactlyInAnyOrder(
                "type", "title", "status", "detail", "instance", "code", "fieldErrors");
        assertThat(result.andReturn().getResponse().getContentAsString()).doesNotContain(
                "TypeMismatchException", "IllegalArgumentException", "java.util.UUID", "org.springframework",
                "Failed to convert", "stackTrace");
    }

    @Test
    void commentsRemainOpenAndLastCommentDeletionNeverUnlocks() throws Exception {
        var original = discussion();
        String id = original.path("id").asText();
        var c1 = comment(id, second);
        assertCountAndLock(id, 1, true);
        var locked = json(mvc.perform(get(DISCUSSIONS + id)));
        assertThat(Instant.parse(locked.path("updatedAt").asText())).isAfter(Instant.parse(original.path("updatedAt").asText()));
        assertThat(c1.propertyNames()).containsExactlyInAnyOrder("id", "discussionId", "author", "body", "createdAt", "updatedAt");
        assertThat(c1.path("author").propertyNames()).containsExactlyInAnyOrder("id", "username");
        assertThat(c1.path("author").path("id").asText()).isEqualTo(second.userId().toString());
        assertThat(c1.path("createdAt")).isEqualTo(c1.path("updatedAt"));
        var result = mutate("POST", DISCUSSIONS + id + "/comments", first,
                mapper.writeValueAsString(Map.of("body", "Another comment", "authorId", second.userId()))).andExpect(status().isCreated());
        var c2 = json(result);
        result.andExpect(header().string("Location", COMMENTS + c2.path("id").asText()));
        assertThat(c2.path("author").path("id").asText()).isEqualTo(first.userId().toString());
        assertCountAndLock(id, 2, true);
        var edited = json(mutate("PATCH", COMMENTS + c1.path("id").asText(), second,
                mapper.writeValueAsString(Map.of("body", "Changed body", "discussionId", UUID.randomUUID(),
                        "authorId", first.userId(), "createdAt", "2000-01-01T00:00:00Z"))).andExpect(status().isOk()));
        assertThat(edited.path("body").asText()).isEqualTo("Changed body");
        for (String field : new String[] {"id", "discussionId", "author", "createdAt"}) assertThat(edited.path(field)).isEqualTo(c1.path(field));
        assertThat(Instant.parse(edited.path("updatedAt").asText())).isAfter(Instant.parse(c1.path("updatedAt").asText()));
        assertSafe(edited.toString());
        mutate("DELETE", COMMENTS + c1.path("id").asText(), second, null).andExpect(status().isNoContent());
        assertCountAndLock(id, 1, true);
        mutate("DELETE", COMMENTS + c2.path("id").asText(), first, null).andExpect(status().isNoContent());
        assertCountAndLock(id, 0, true);
        mutate("PATCH", DISCUSSIONS + id, first, "{\"title\":\"Locked title\"}").andExpect(problem(409, "DISCUSSION_LOCKED"));
        mutate("DELETE", DISCUSSIONS + id, first, null).andExpect(problem(409, "DISCUSSION_LOCKED"));
        mvc.perform(get(COUNTRIES)).andExpect(jsonPath("$.items[0].locked").value(true)).andExpect(jsonPath("$.items[0].commentCount").value(0));
    }

    @Test
    void nonOwnerCannotModifyComment() throws Exception {
        String id = discussion().path("id").asText();
        var original = comment(id, first);
        String cid = original.path("id").asText();
        mutate("PATCH", COMMENTS + cid, second, "{\"body\":\"Changed\"}").andExpect(problem(403, "COMMENT_NOT_OWNED"));
        mutate("DELETE", COMMENTS + cid, second, null).andExpect(problem(403, "COMMENT_NOT_OWNED"));
        assertThat(json(mvc.perform(get(DISCUSSIONS + id + "/comments"))).path("items").get(0)).isEqualTo(original);
    }

    static Stream<String> invalidComments() {
        return Stream.of("{}", "{\"body\":null}", "{\"body\":\"\"}", "{\"body\":\"   \"}", "{\"body\":\"" + "a".repeat(2001) + "\"}");
    }
    @ParameterizedTest @MethodSource("invalidComments")
    void invalidCommentCreateLeavesDiscussionUnlocked(String body) throws Exception {
        String id = discussion().path("id").asText();
        mutate("POST", DISCUSSIONS + id + "/comments", first, body).andExpect(problem(400, "VALIDATION_FAILED"));
        assertCountAndLock(id, 0, false);
    }
    @ParameterizedTest @MethodSource("invalidComments")
    void invalidCommentUpdatePreservesContent(String body) throws Exception {
        String id = discussion().path("id").asText();
        var original = comment(id, first);
        mutate("PATCH", COMMENTS + original.path("id").asText(), first, body).andExpect(problem(400, "VALIDATION_FAILED"));
        assertThat(json(mvc.perform(get(DISCUSSIONS + id + "/comments"))).path("items").get(0)).isEqualTo(original);
    }

    @ParameterizedTest @CsvSource({"page,-1", "page,no", "page,2147483648", "page,2147483647", "size,0", "size,-1", "size,no", "size,101"})
    void invalidPaginationReturns400(String parameter, String value) throws Exception {
        String id = discussion().path("id").asText();
        for (String path : new String[] {COUNTRIES, DISCUSSIONS + id + "/comments"})
            mvc.perform(get(path).param(parameter, value)).andExpect(problem(400, "INVALID_QUERY_PARAMETER"));
        mvc.perform(get(COUNTRIES).param("size", "51")).andExpect(problem(400, "INVALID_QUERY_PARAMETER"));
    }

    @Test
    void emptyAndMaximumPagesMatchContract() throws Exception {
        mvc.perform(get(COUNTRIES).param("size", "50")).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.page").value(0)).andExpect(jsonPath("$.size").value(50))
                .andExpect(jsonPath("$.totalItems").value(0)).andExpect(jsonPath("$.totalPages").value(0));
        String id = discussion().path("id").asText();
        mvc.perform(get(DISCUSSIONS + id + "/comments")).andExpect(status().isOk()).andExpect(jsonPath("$.size").value(20));
        mvc.perform(get(DISCUSSIONS + id + "/comments").param("size", "100")).andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(100)).andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void paginationIsOrderedStableAndUsesConstantQueryCounts() throws Exception {
        String a = discussion().path("id").asText();
        String b = discussion().path("id").asText();
        String c = discussion().path("id").asText();
        for (int i = 0; i < 10; i++) comment(a, i % 2 == 0 ? first : second);
        jdbc.update("update discussions set created_at = '2020-01-01' where id=?", UUID.fromString(c));
        jdbc.update("update discussions set created_at = '2021-01-01' where id=?", UUID.fromString(b));
        jdbc.update("update discussions set created_at = '2022-01-01' where id=?", UUID.fromString(a));
        mvc.perform(get(COUNTRIES).param("size", "1").param("page", "1")).andExpect(jsonPath("$.items[0].id").value(b))
                .andExpect(jsonPath("$.totalItems").value(3)).andExpect(jsonPath("$.totalPages").value(3));
        var statistics = entityManagers.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        mvc.perform(get(COUNTRIES).param("size", "2")).andExpect(jsonPath("$.items[0].id").value(a)).andExpect(jsonPath("$.items[0].commentCount").value(10));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        statistics.clear();
        mvc.perform(get(DISCUSSIONS + a)).andExpect(status().isOk());
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(1);
        var chronological = jdbc.queryForList("select id::text from comments order by created_at asc, id asc", String.class);
        var firstPage = json(mvc.perform(get(DISCUSSIONS + a + "/comments").param("size", "4")));
        for (int i = 0; i < 4; i++) assertThat(firstPage.path("items").get(i).path("id").asText()).isEqualTo(chronological.get(i));
        jdbc.update("update comments set created_at = '2020-01-01'");
        var ids = jdbc.queryForList("select id::text from comments order by created_at asc, id asc", String.class);
        statistics.clear();
        var page = json(mvc.perform(get(DISCUSSIONS + a + "/comments").param("size", "4").param("page", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(10)).andExpect(jsonPath("$.totalPages").value(3)));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(3);
        for (int i = 0; i < 4; i++) assertThat(page.path("items").get(i).path("id").asText()).isEqualTo(ids.get(i + 4));
        assertSafe(page.toString());
        jdbc.update("update discussions set created_at = '2020-01-01'");
        var discussionIds = jdbc.queryForList("select id::text from discussions order by created_at desc, id desc", String.class);
        mvc.perform(get(COUNTRIES).param("page", "1").param("size", "1")).andExpect(jsonPath("$.items[0].id").value(discussionIds.get(1)));
        mvc.perform(get(COUNTRIES).param("page", "99")).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.totalItems").value(3));
    }

    @Test
    void tenDiscussionSummariesStillUseOnlyTwoQueriesAndNoEntityLoads() throws Exception {
        for (int i = 0; i < 11; i++) {
            String id = discussion().path("id").asText();
            comment(id, second);
        }
        var statistics = entityManagers.unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        mvc.perform(get(COUNTRIES)).andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(10))
                .andExpect(jsonPath("$.totalItems").value(11));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        assertThat(statistics.getEntityLoadCount()).isZero();
    }

    @Test
    void singleFirstCommentLocksBeforeAndAfterItsDeletion() throws Exception {
        String id = discussion().path("id").asText();
        String cid = comment(id, second).path("id").asText();
        for (boolean deleted : new boolean[] {false, true}) {
            if (deleted) mutate("DELETE", COMMENTS + cid, second, null).andExpect(status().isNoContent());
            assertCountAndLock(id, deleted ? 0 : 1, true);
            mutate("PATCH", DISCUSSIONS + id, first, "{\"body\":\"Cannot change\"}")
                    .andExpect(problem(409, "DISCUSSION_LOCKED"));
            mutate("DELETE", DISCUSSIONS + id, first, null).andExpect(problem(409, "DISCUSSION_LOCKED"));
        }
    }

    @ParameterizedTest @ValueSource(ints = {5, 150})
    void exactContentLengthBoundariesAreAllowed(int titleLength) throws Exception {
        var created = json(mutate("POST", COUNTRIES, first,
                mapper.writeValueAsString(Map.of("title", "a".repeat(titleLength), "body", "b".repeat(5000))))
                .andExpect(status().isCreated()));
        String id = created.path("id").asText();
        mutate("PATCH", DISCUSSIONS + id, first,
                mapper.writeValueAsString(Map.of("title", "c".repeat(titleLength), "body", "d".repeat(5000))))
                .andExpect(status().isOk());
        var comment = json(mutate("POST", DISCUSSIONS + id + "/comments", first,
                mapper.writeValueAsString(Map.of("body", "a".repeat(2000)))).andExpect(status().isCreated()));
        mutate("PATCH", COMMENTS + comment.path("id").asText(), first,
                mapper.writeValueAsString(Map.of("body", "b".repeat(2000)))).andExpect(status().isOk());
    }

    @Test
    void securityDoesNotExposeUnspecifiedCommunityRoutes() throws Exception {
        mvc.perform(get("/api/v1/discussions")).andExpect(problem(401, "AUTHENTICATION_REQUIRED"));
        mvc.perform(get(COMMENTS + UUID.randomUUID()).with(user(first))).andExpect(problem(403, "ACCESS_DENIED"));
        mutate("POST", DISCUSSIONS + UUID.randomUUID(), first, "{}").andExpect(problem(403, "ACCESS_DENIED"));
    }

    private void assertCountAndLock(String id, int count, boolean locked) throws Exception {
        mvc.perform(get(DISCUSSIONS + id)).andExpect(status().isOk()).andExpect(jsonPath("$.commentCount").value(count)).andExpect(jsonPath("$.locked").value(locked));
    }
    private static String path(String resource, String id) {
        return switch (resource) {
            case "country" -> COUNTRIES;
            case "discussion" -> DISCUSSIONS + id;
            case "comments" -> DISCUSSIONS + id + "/comments";
            case "comment" -> COMMENTS + id;
            default -> throw new IllegalArgumentException();
        };
    }
    private static void assertSafe(String json) {
        assertThat(json).doesNotContain("email", "password", "passwordHash", "password_hash", "session", "credentials");
    }
}

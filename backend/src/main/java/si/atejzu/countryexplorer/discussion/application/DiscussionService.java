package si.atejzu.countryexplorer.discussion.application;

import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import si.atejzu.countryexplorer.common.api.PageResponse;
import si.atejzu.countryexplorer.country.application.CountryService;
import si.atejzu.countryexplorer.discussion.api.CreateDiscussionRequest;
import si.atejzu.countryexplorer.discussion.api.DiscussionResponse;
import si.atejzu.countryexplorer.discussion.api.DiscussionSummaryResponse;
import si.atejzu.countryexplorer.discussion.api.UpdateDiscussionRequest;
import si.atejzu.countryexplorer.discussion.domain.Discussion;
import si.atejzu.countryexplorer.discussion.persistence.DiscussionRepository;

@Service
public class DiscussionService {
    private final DiscussionRepository discussions;
    private final CountryService countries;
    private final TransactionTemplate writes;

    public DiscussionService(DiscussionRepository discussions, CountryService countries,
            PlatformTransactionManager transactions) {
        this.discussions = discussions;
        this.countries = countries;
        this.writes = new TransactionTemplate(transactions);
    }

    @Transactional(readOnly = true)
    public PageResponse<DiscussionSummaryResponse> list(String countryCode, Pageable page) {
        return PageResponse.from(discussions.summaries(CountryService.normalizeCode(countryCode), page));
    }

    public DiscussionResponse createDiscussion(UUID userId, String countryCode, CreateDiscussionRequest request) {
        String code = CountryService.normalizeCode(countryCode);
        countries.summaries(List.of(code));
        // A cold catalogue may call upstream: finish that before opening the write transaction.
        return writes.execute(status -> {
            var discussion = discussions.saveAndFlush(new Discussion(userId, code, request.title(), request.body()));
            return detail(discussion.getId());
        });
    }

    @Transactional(readOnly = true)
    public DiscussionResponse detail(UUID id) {
        return discussions.detail(id).orElseThrow(DiscussionNotFoundException::new);
    }

    @Transactional
    public DiscussionResponse updateDiscussion(UUID id, UUID userId, UpdateDiscussionRequest request) {
        var discussion = ownedUnlocked(id, userId);
        discussion.edit(request.title(), request.body());
        discussions.flush();
        return detail(id);
    }

    @Transactional
    public void deleteDiscussion(UUID id, UUID userId) {
        discussions.delete(ownedUnlocked(id, userId));
    }

    private Discussion ownedUnlocked(UUID id, UUID userId) {
        var discussion = discussions.findByIdForUpdate(id).orElseThrow(DiscussionNotFoundException::new);
        if (!discussion.getAuthorId().equals(userId)) throw new DiscussionNotOwnedException();
        if (discussion.hasReceivedComments()) throw new DiscussionLockedException();
        return discussion;
    }
}

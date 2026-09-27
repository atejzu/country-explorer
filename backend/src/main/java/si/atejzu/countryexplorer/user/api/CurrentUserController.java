package si.atejzu.countryexplorer.user.api;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;
import si.atejzu.countryexplorer.user.application.CurrentUserService;

@RestController
public class CurrentUserController {
    private final CurrentUserService users;

    public CurrentUserController(CurrentUserService users) { this.users = users; }

    @GetMapping("/api/v1/users/me")
    public CurrentUserResponse currentUser(@AuthenticationPrincipal AppUserPrincipal principal) {
        return users.currentUser(principal.userId());
    }
}

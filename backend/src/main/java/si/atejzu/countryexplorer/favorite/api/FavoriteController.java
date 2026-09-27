package si.atejzu.countryexplorer.favorite.api;

import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import si.atejzu.countryexplorer.common.security.AppUserPrincipal;
import si.atejzu.countryexplorer.favorite.application.FavoriteService;

@RestController
@RequestMapping("/api/v1/users/me/favorites")
public class FavoriteController {
    private final FavoriteService favorites;

    public FavoriteController(FavoriteService favorites) { this.favorites = favorites; }

    @GetMapping
    public List<FavoriteCountryResponse> list(@AuthenticationPrincipal AppUserPrincipal principal) {
        return favorites.list(principal.userId());
    }

    @PutMapping("/{countryCode}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void add(@AuthenticationPrincipal AppUserPrincipal principal, @PathVariable String countryCode) {
        favorites.add(principal.userId(), countryCode);
    }

    @DeleteMapping("/{countryCode}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal AppUserPrincipal principal, @PathVariable String countryCode) {
        favorites.remove(principal.userId(), countryCode);
    }
}

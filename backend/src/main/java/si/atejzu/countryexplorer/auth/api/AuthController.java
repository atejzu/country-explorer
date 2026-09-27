package si.atejzu.countryexplorer.auth.api;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import si.atejzu.countryexplorer.auth.application.RegistrationService;
import si.atejzu.countryexplorer.user.api.CurrentUserResponse;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final RegistrationService registration;

    public AuthController(RegistrationService registration) { this.registration = registration; }

    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf(CsrfToken token) {
        token.getToken(); // Materialize the deferred cookie; never return the token in JSON.
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public CurrentUserResponse register(@Valid @RequestBody RegisterRequest request) {
        return registration.register(request);
    }
}

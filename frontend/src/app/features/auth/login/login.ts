import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthStore } from '../../../core/auth/auth-store';
import { safeReturnUrl } from '../../../core/auth/safe-return-url';
import { apiProblem } from '../../../core/http/api-problem';
import { AuthRecovery } from '../auth-recovery';
import { AuthFieldErrors } from '../auth-field-errors';
import { GlobeBackground } from '../../../shared/ui/globe-background/globe-background';

@Component({
  selector: 'app-login', imports: [FormField, RouterLink, AuthRecovery, AuthFieldErrors, GlobeBackground],
  templateUrl: './login.html',
})
export class Login {
  protected readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  protected get returnUrl(): string { return safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')); }
  protected readonly model = signal({ email: '', password: '' });
  protected readonly error = signal('');
  protected readonly loginForm = form(this.model, path => {
    required(path.email, { message: 'Vnesi e-poštni naslov.' });
    email(path.email, { message: 'Vnesi veljaven e-poštni naslov.' });
    required(path.password, { message: 'Vnesi geslo.' });
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.auth.mutationsReady()) return;
    void submit(this.loginForm, async () => {
      this.error.set('');
      try {
        await this.auth.login(this.model());
        this.model.update(value => ({ ...value, password: '' }));
      } catch (error: unknown) {
        this.error.set(apiProblem(error)?.code === 'INVALID_CREDENTIALS'
          ? 'E-poštni naslov ali geslo ni pravilno.'
          : 'Izida prijave ni bilo mogoče potrditi.');
      }
    });
  }
}

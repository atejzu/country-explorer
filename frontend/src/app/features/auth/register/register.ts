import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { email, form, FormField, maxLength, minLength, required, submit, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../../core/auth/auth-api';
import { AuthStore } from '../../../core/auth/auth-store';
import { safeReturnUrl } from '../../../core/auth/safe-return-url';
import { apiProblem } from '../../../core/http/api-problem';
import { NotificationStore } from '../../../core/notifications/notification-store';
import { AuthRecovery } from '../auth-recovery';
import { AuthFieldErrors } from '../auth-field-errors';

@Component({
  selector: 'app-register', imports: [FormField, RouterLink, AuthRecovery, AuthFieldErrors],
  templateUrl: './register.html',
})
export class Register {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  protected get returnUrl(): string { return safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')); }
  protected readonly model = signal({ username: '', email: '', password: '', confirmPassword: '' });
  protected readonly error = signal('');
  protected readonly registerForm = form(this.model, path => {
    required(path.username, { message: 'Vnesi uporabniško ime.' });
    minLength(path.username, 3, { message: 'Uporabniško ime naj vsebuje od 3 do 30 znakov.' });
    maxLength(path.username, 30, { message: 'Uporabniško ime naj vsebuje od 3 do 30 znakov.' });
    validate(path.username, ({ value }) => value() && !value().trim()
      ? { kind: 'blank', message: 'Vnesi uporabniško ime.' } : undefined);
    required(path.email, { message: 'Vnesi e-poštni naslov.' });
    email(path.email, { message: 'Vnesi veljaven e-poštni naslov.' });
    maxLength(path.email, 254, { message: 'E-poštni naslov je lahko dolg največ 254 znakov.' });
    required(path.password, { message: 'Vnesi geslo.' });
    minLength(path.password, 8, { message: 'Geslo naj vsebuje od 8 do 72 znakov.' });
    maxLength(path.password, 72, { message: 'Geslo naj vsebuje od 8 do 72 znakov.' });
    validate(path.password, ({ value }) => value() && !value().trim()
      ? { kind: 'blank', message: 'Vnesi geslo.' } : undefined);
    required(path.confirmPassword, { message: 'Ponovno vnesi geslo.' });
    validate(path.confirmPassword, ({ value, valueOf }) => value() !== valueOf(path.password)
      ? { kind: 'mismatch', message: 'Gesli se ne ujemata.' } : undefined);
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (!this.auth.mutationsReady()) return;
    void submit(this.registerForm, async fields => {
      this.error.set('');
      try {
        const { username, email, password } = this.model();
        await firstValueFrom(this.api.register({ username, email, password }).pipe(
          takeUntilDestroyed(this.destroyRef)));
        this.model.update(value => ({ ...value, password: '', confirmPassword: '' }));
        if (!this.destroyRef.destroyed) {
          this.notifications.show('Račun je ustvarjen. Za nadaljevanje se prijavi.', 'success');
          await this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl } });
        }
      } catch (error: unknown) {
        const problem = apiProblem(error);
        if (problem?.code === 'USERNAME_ALREADY_EXISTS') return {
          fieldTree: fields.username, kind: 'server', message: 'To uporabniško ime je že zasedeno.',
        };
        if (problem?.code === 'EMAIL_ALREADY_EXISTS') return {
          fieldTree: fields.email, kind: 'server', message: 'Ta e-poštni naslov je že v uporabi.',
        };
        if (problem?.code === 'VALIDATION_FAILED') {
          const messages = {
            username: 'Preveri uporabniško ime (od 3 do 30 znakov).',
            email: 'Preveri e-poštni naslov (največ 254 znakov).',
            password: 'Preveri geslo (od 8 do 72 znakov).',
          };
          const errors = (problem.fieldErrors ?? []).flatMap(({ field }) => {
            if (field !== 'username' && field !== 'email' && field !== 'password') return [];
            return [{ fieldTree: fields[field], kind: 'server', message: messages[field] }];
          });
          if (errors.length) return errors;
        }
        this.error.set('Ustvaritve računa ni bilo mogoče potrditi. Če je bil račun ustvarjen, se lahko poskusiš prijaviti.');
      }
      return undefined;
    });
  }
}

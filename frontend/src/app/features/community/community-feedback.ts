import { HttpErrorResponse } from '@angular/common/http';
import { apiProblem } from '../../core/http/api-problem';

export const LOCK_MESSAGE = 'Te razprave ni več mogoče urejati ali izbrisati, ker je prejela komentar.';
export const COMMENT_FAILURE = 'Komentarja ni bilo mogoče shraniti. Tvoje besedilo je ostalo v obrazcu. Poskusi znova.';
export const TITLE_ERROR = 'Uporabi 5–150 znakov.';
export const BODY_ERROR = 'Vnesi vsebino z največ 5.000 znaki.';
export const COMMENT_ERROR = 'Vnesi komentar z največ 2.000 znaki.';
export function notFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}
export function communityError(error: unknown): string {
  switch (apiProblem(error)?.code) {
    case 'VALIDATION_FAILED': return 'Preveri vnesene podatke.';
    case 'INVALID_QUERY_PARAMETER': return 'Te strani rezultatov ni mogoče naložiti. Poskusi znova.';
    case 'AUTHENTICATION_REQUIRED': return 'Za nadaljevanje se znova prijavi. Besedilo je ostalo v obrazcu.';
    case 'ACCESS_DENIED': return 'Dejanje ni dovoljeno. Preveri prijavo in poskusi znova.';
    case 'DISCUSSION_NOT_OWNED': return 'Te razprave ne moreš urejati ali izbrisati.';
    case 'COMMENT_NOT_OWNED': return 'Tega komentarja ne moreš urejati ali izbrisati.';
    case 'COUNTRY_NOT_FOUND': return 'Države ni bilo mogoče najti. Vrni se na raziskovanje.';
    case 'DISCUSSION_NOT_FOUND': return 'Razprave ni bilo mogoče najti.';
    case 'COMMENT_NOT_FOUND': return 'Komentar ne obstaja več.';
    case 'DISCUSSION_LOCKED': return LOCK_MESSAGE;
    case 'COUNTRY_SERVICE_UNAVAILABLE': return 'Storitev trenutno ni na voljo. Poskusi znova.';
    case 'INTERNAL_ERROR':
    default: return 'Dejanja ni bilo mogoče dokončati. Poskusi znova.';
  }
}

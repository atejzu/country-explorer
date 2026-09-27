import { HttpErrorResponse } from '@angular/common/http';
import { apiProblem, isApiProblem } from './api-problem';
import { problem } from '../auth/auth.fixture';

describe('API Problem Details', () => {
  it('parses typed problems with field identities', () => {
    const body = { ...problem('VALIDATION_FAILED', 400), fieldErrors: [{ field: 'email', message: 'Technical' }] };
    expect(apiProblem(new HttpErrorResponse({ error: body, status: 400 }))).toEqual(body);
  });
  it.each([null, 'failure', { code: 'INTERNAL_ERROR' }, { ...problem('VALIDATION_FAILED'), fieldErrors: [null] }])
    ('rejects malformed problem data', value => expect(isApiProblem(value)).toBe(false));
});

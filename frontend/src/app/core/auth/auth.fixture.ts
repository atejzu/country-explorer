import { CurrentUser } from './auth.models';
import { ApiProblem } from '../http/api-problem';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { AuthStore } from './auth-store';

export const currentUser: CurrentUser = {
  id: '5e940a3e-27ad-4643-8cf2-ab618421acaa', username: 'marko92',
  email: 'marko@example.com', createdAt: '2026-09-26T11:30:00Z',
};
export const authUser = { id: currentUser.id, username: currentUser.username, email: currentUser.email };
export function problem(code: string, status = 401): ApiProblem {
  return { type: 'about:blank', title: 'Technical error', status, detail: 'English backend detail', instance: '/api/v1/test', code };
}

export async function initializeTestSession(authenticated = false): Promise<void> {
  const ready = TestBed.inject(AuthStore).initialize();
  const http = TestBed.inject(HttpTestingController);
  http.expectOne('/api/v1/auth/csrf').flush(null, { status: 204, statusText: 'No Content' });
  await Promise.resolve();
  const me = http.expectOne('/api/v1/users/me');
  if (authenticated) me.flush(currentUser);
  else me.flush(problem('AUTHENTICATION_REQUIRED'), { status: 401, statusText: 'Unauthorized' });
  await ready;
}

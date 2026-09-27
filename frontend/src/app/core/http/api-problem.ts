import { HttpErrorResponse } from '@angular/common/http';

export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  fieldErrors?: { field: string; message: string }[];
}

export function isApiProblem(value: unknown): value is ApiProblem {
  if (!value || typeof value !== 'object') return false;
  return 'type' in value && typeof value.type === 'string' &&
    'title' in value && typeof value.title === 'string' &&
    'status' in value && typeof value.status === 'number' &&
    'detail' in value && typeof value.detail === 'string' &&
    'instance' in value && typeof value.instance === 'string' &&
    'code' in value && typeof value.code === 'string' &&
    (!('fieldErrors' in value) || (Array.isArray(value.fieldErrors) && value.fieldErrors.every(
      (field: unknown) => !!field && typeof field === 'object' &&
        'field' in field && typeof field.field === 'string' &&
        'message' in field && typeof field.message === 'string')));
}

export function apiProblem(error: unknown): ApiProblem | null {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  return isApiProblem(body) ? body : null;
}

export function isAuthenticationRequired(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 401 &&
    apiProblem(error)?.code === 'AUTHENTICATION_REQUIRED';
}

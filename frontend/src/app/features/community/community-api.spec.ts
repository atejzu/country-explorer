import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CommunityApi } from './community-api';
import { comment, discussion, page } from './community.fixture';

describe('CommunityApi', () => {
  let api: CommunityApi; let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(CommunityApi); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('GETs typed country discussions with explicit pagination', () => {
    const received = vi.fn(); api.getDiscussions('SVN', 2, 10).subscribe(received);
    const request = http.expectOne('/api/v1/countries/SVN/discussions?page=2&size=10');
    expect(request.request.method).toBe('GET'); request.flush(page([discussion], 2, 10, 21));
    expect(received).toHaveBeenCalledWith(page([discussion], 2, 10, 21));
  });
  it('POSTs only title/body to a country', () => {
    const received = vi.fn(); const body = { title: 'Naslov razprave', body: 'Vsebina' };
    api.createDiscussion('SVN', body).subscribe(received);
    const request = http.expectOne('/api/v1/countries/SVN/discussions');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual(body);
    request.flush(discussion, { status: 201, statusText: 'Created' }); expect(received).toHaveBeenCalledWith(discussion);
  });
  it('GETs a typed discussion independently of comments', () => {
    const received = vi.fn(); api.getDiscussion(discussion.id).subscribe(received);
    const request = http.expectOne('/api/v1/discussions/discussion-1'); expect(request.request.method).toBe('GET');
    request.flush(discussion); expect(received).toHaveBeenCalledWith(discussion);
  });
  it.each([{ title: 'Nov naslov' }, { body: 'Nova vsebina' }, { title: 'Nov naslov', body: 'Nova vsebina' }])('PATCHes allowed discussion fields %j', body => {
    const received = vi.fn(); api.updateDiscussion(discussion.id, body).subscribe(received);
    const request = http.expectOne('/api/v1/discussions/discussion-1');
    expect(request.request.method).toBe('PATCH'); expect(request.request.body).toEqual(body);
    request.flush({ ...discussion, ...body }); expect(received).toHaveBeenCalledWith({ ...discussion, ...body });
  });
  it('DELETEs a discussion without a body', () => {
    const received = vi.fn(); api.deleteDiscussion(discussion.id).subscribe(received);
    const request = http.expectOne('/api/v1/discussions/discussion-1');
    expect(request.request.method).toBe('DELETE'); expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' }); expect(received).toHaveBeenCalledOnce();
  });
  it('GETs typed comments with pagination', () => {
    const received = vi.fn(); api.getComments(discussion.id, 1, 20).subscribe(received);
    const request = http.expectOne('/api/v1/discussions/discussion-1/comments?page=1&size=20');
    expect(request.request.method).toBe('GET'); request.flush(page([comment], 1, 20, 21));
    expect(received).toHaveBeenCalledWith(page([comment], 1, 20, 21));
  });
  it('POSTs only comment body', () => {
    const received = vi.fn(); api.createComment(discussion.id, { body: 'Komentar' }).subscribe(received);
    const request = http.expectOne('/api/v1/discussions/discussion-1/comments');
    expect(request.request.method).toBe('POST'); expect(request.request.body).toEqual({ body: 'Komentar' });
    request.flush(comment, { status: 201, statusText: 'Created' }); expect(received).toHaveBeenCalledWith(comment);
  });
  it('PATCHes only comment body', () => {
    const received = vi.fn(); api.updateComment(comment.id, { body: 'Popravek' }).subscribe(received);
    const request = http.expectOne('/api/v1/comments/comment-1'); expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ body: 'Popravek' }); request.flush(comment); expect(received).toHaveBeenCalledWith(comment);
  });
  it('DELETEs a comment without a body', () => {
    api.deleteComment(comment.id).subscribe(); const request = http.expectOne('/api/v1/comments/comment-1');
    expect(request.request.method).toBe('DELETE'); expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });
  });
  it('defaults to 10 discussions and 20 comments', () => {
    api.getDiscussions('SVN').subscribe(); api.getComments(discussion.id).subscribe();
    http.expectOne('/api/v1/countries/SVN/discussions?page=0&size=10').flush(page([], 0, 10));
    http.expectOne('/api/v1/discussions/discussion-1/comments?page=0&size=20').flush(page([]));
  });
});

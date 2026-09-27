import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Comment, CommentRequest, CreateDiscussionRequest, Discussion, DiscussionSummary, PageResponse, UpdateDiscussionRequest } from './community.models';

@Injectable({ providedIn: 'root' })
export class CommunityApi {
  private readonly http = inject(HttpClient);
  getDiscussions(code: string, page = 0, size = 10): Observable<PageResponse<DiscussionSummary>> {
    return this.http.get<PageResponse<DiscussionSummary>>(`/api/v1/countries/${encodeURIComponent(code)}/discussions`, { params: { page, size } });
  }
  createDiscussion(code: string, body: CreateDiscussionRequest): Observable<Discussion> {
    return this.http.post<Discussion>(`/api/v1/countries/${encodeURIComponent(code)}/discussions`, body);
  }
  getDiscussion(id: string): Observable<Discussion> {
    return this.http.get<Discussion>(`/api/v1/discussions/${encodeURIComponent(id)}`);
  }
  updateDiscussion(id: string, body: UpdateDiscussionRequest): Observable<Discussion> {
    return this.http.patch<Discussion>(`/api/v1/discussions/${encodeURIComponent(id)}`, body);
  }
  deleteDiscussion(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/discussions/${encodeURIComponent(id)}`);
  }
  getComments(id: string, page = 0, size = 20): Observable<PageResponse<Comment>> {
    return this.http.get<PageResponse<Comment>>(`/api/v1/discussions/${encodeURIComponent(id)}/comments`, { params: { page, size } });
  }
  createComment(id: string, body: CommentRequest): Observable<Comment> {
    return this.http.post<Comment>(`/api/v1/discussions/${encodeURIComponent(id)}/comments`, body);
  }
  updateComment(id: string, body: CommentRequest): Observable<Comment> {
    return this.http.patch<Comment>(`/api/v1/comments/${encodeURIComponent(id)}`, body);
  }
  deleteComment(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/comments/${encodeURIComponent(id)}`);
  }
}

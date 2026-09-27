export interface PublicUser { id: string; username: string; }
export interface PageResponse<T> { items: T[]; page: number; size: number; totalItems: number; totalPages: number; }
export interface DiscussionSummary {
  id: string;
  title: string;
  author: PublicUser;
  countryCode: string;
  commentCount: number;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Discussion extends DiscussionSummary { body: string; }
export interface Comment {
  id: string;
  discussionId: string;
  author: PublicUser;
  body: string;
  createdAt: string;
  updatedAt: string;
}
export interface CreateDiscussionRequest { title: string; body: string; }
export interface UpdateDiscussionRequest { title?: string; body?: string; }
export interface CommentRequest { body: string; }

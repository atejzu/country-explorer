export interface AuthUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
}

export interface CurrentUser extends AuthUser {
  readonly createdAt: string;
}

export interface LoginResponse { readonly user: AuthUser; }
export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest extends LoginRequest { username: string; }

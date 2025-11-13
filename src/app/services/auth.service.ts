import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';

export interface User {
  id: string;
  email: string;
  displayName: string;
  preferences: {
    defaultListVisibility?: boolean;
    theme?: 'light' | 'dark' | 'system';
    allowClaimsByDefault?: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData extends LoginCredentials {
  displayName: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  // Signals for state management
  private readonly currentUserSignal = signal<User | null>(null);
  private readonly isLoadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);

  // Computed signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  /**
   * Check if user is authenticated (call on app init)
   */
  checkAuth() {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<{ user: User }>('/auth/me').pipe(
      tap(response => {
        if (response.data?.user) {
          this.currentUserSignal.set(response.data.user);
        }
        this.isLoadingSignal.set(false);
      }),
      catchError(error => {
        this.currentUserSignal.set(null);
        this.isLoadingSignal.set(false);
        return of(null);
      })
    );
  }

  /**
   * Login user
   */
  login(credentials: LoginCredentials) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<{ user: User }>('/auth/login', credentials).pipe(
      tap(response => {
        if (response.data?.user) {
          this.currentUserSignal.set(response.data.user);
          this.router.navigate(['/dashboard']);
        }
        this.isLoadingSignal.set(false);
      }),
      catchError(error => {
        this.errorSignal.set(error.message);
        this.isLoadingSignal.set(false);
        throw error;
      })
    );
  }

  /**
   * Sign up new user
   */
  signup(data: SignupData) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<{ user: User }>('/auth/signup', data).pipe(
      tap(response => {
        if (response.data?.user) {
          this.currentUserSignal.set(response.data.user);
          this.router.navigate(['/dashboard']);
        }
        this.isLoadingSignal.set(false);
      }),
      catchError(error => {
        this.errorSignal.set(error.message);
        this.isLoadingSignal.set(false);
        throw error;
      })
    );
  }

  /**
   * Logout user
   */
  logout() {
    this.isLoadingSignal.set(true);
    
    return this.api.post('/auth/logout', {}).pipe(
      tap(() => {
        this.currentUserSignal.set(null);
        this.router.navigate(['/login']);
        this.isLoadingSignal.set(false);
      }),
      catchError(error => {
        this.currentUserSignal.set(null);
        this.router.navigate(['/login']);
        this.isLoadingSignal.set(false);
        return of(null);
      })
    );
  }

  /**
   * Clear error message
   */
  clearError() {
    this.errorSignal.set(null);
  }

  /**
   * Update user data (for settings changes)
   */
  updateUser(user: User) {
    this.currentUserSignal.set(user);
  }
}


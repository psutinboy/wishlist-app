import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { tap, catchError } from 'rxjs/operators';

export interface Claim {
  id: string;
  itemId: string;
  claimerName: string;
  secretToken: string;
  claimedAt: Date;
}

export interface CreateClaimData {
  itemId: string;
  claimerName: string;
  claimerNote?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClaimService {
  private readonly api = inject(ApiService);

  // Signals for state management
  private readonly isLoadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);

  // Readonly accessors
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Claim an item (public endpoint)
   */
  claimItem(data: CreateClaimData) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<{ claim: Claim; message: string }>('/claims', data).pipe(
      tap(() => {
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
   * Unclaim an item (public endpoint, requires secret token)
   */
  unclaimItem(claimId: string, secretToken: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.delete<{ message: string }>(`/claims/${claimId}?token=${secretToken}`).pipe(
      tap(() => {
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
   * Clear error message
   */
  clearError() {
    this.errorSignal.set(null);
  }

  /**
   * Store claim token locally (for unclaiming later)
   */
  storeClaimToken(itemId: string, claimId: string, token: string) {
    const claims = this.getStoredClaims();
    claims[itemId] = { claimId, token, claimedAt: new Date().toISOString() };
    localStorage.setItem('wishlist_claims', JSON.stringify(claims));
  }

  /**
   * Get stored claim token for an item
   */
  getClaimToken(itemId: string): { claimId: string; token: string } | null {
    const claims = this.getStoredClaims();
    return claims[itemId] || null;
  }

  /**
   * Remove stored claim token
   */
  removeClaimToken(itemId: string) {
    const claims = this.getStoredClaims();
    delete claims[itemId];
    localStorage.setItem('wishlist_claims', JSON.stringify(claims));
  }

  /**
   * Get all stored claims
   */
  private getStoredClaims(): any {
    try {
      const stored = localStorage.getItem('wishlist_claims');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }
}


import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { tap, catchError } from 'rxjs/operators';

export interface WishItem {
  id: string;
  listId: string;
  title: string;
  url?: string;
  price?: number; // in cents
  imageUrl?: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  isClaimed?: boolean;
  claimedAt?: Date;
}

export interface CreateItemData {
  listId: string;
  title: string;
  url?: string;
  price?: number;
  imageUrl?: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';
  notes?: string;
}

export interface UpdateItemData {
  title?: string;
  url?: string;
  price?: number;
  imageUrl?: string;
  category?: string;
  priority?: 'high' | 'medium' | 'low';
  notes?: string;
}

export interface UrlMetadata {
  title?: string;
  imageUrl?: string;
  price?: number;
  category?: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ItemService {
  private readonly api = inject(ApiService);

  // Signals for state management
  private readonly isLoadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);

  // Readonly accessors
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Get items for a specific list
   */
  getItems(listId: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<{ items: WishItem[] }>(`/items?listId=${listId}`).pipe(
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
   * Preview URL metadata
   */
  previewUrl(url: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<{ metadata: UrlMetadata; url: string }>('/items/preview', { url }).pipe(
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
   * Create new item
   */
  createItem(data: CreateItemData) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<{ item: WishItem }>('/items', data).pipe(
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
   * Update item
   */
  updateItem(id: string, data: UpdateItemData) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.patch<{ item: WishItem }>(`/items/${id}`, data).pipe(
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
   * Delete item
   */
  deleteItem(id: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.delete(`/items/${id}`).pipe(
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
}


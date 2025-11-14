import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export interface WishList {
  id: string;
  ownerId: string;
  title: string;
  isPublic: boolean;
  shareId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListData {
  title: string;
  isPublic?: boolean;
}

export interface UpdateListData {
  title?: string;
  isPublic?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ListService {
  private readonly api = inject(ApiService);

  // Signals for state management
  private readonly listsSignal = signal<WishList[]>([]);
  private readonly isLoadingSignal = signal<boolean>(false);
  private readonly errorSignal = signal<string | null>(null);

  // Readonly accessors
  readonly lists = this.listsSignal.asReadonly();
  readonly isLoading = this.isLoadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /**
   * Get all lists for authenticated user
   */
  getLists() {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<{ lists: WishList[] }>('/lists').pipe(
      tap(response => {
        if (response.data?.lists) {
          this.listsSignal.set(response.data.lists);
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
   * Create new list
   */
  createList(data: CreateListData) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<{ list: WishList }>('/lists', data).pipe(
      tap(response => {
        if (response.data?.list) {
          // Add new list to the beginning of the array
          this.listsSignal.update(lists => [response.data!.list, ...lists]);
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
   * Get single list with items
   */
  getList(id: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<{ list: WishList; items: any[] }>(`/lists/${id}`).pipe(
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
   * Update list
   */
  updateList(id: string, data: UpdateListData) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.patch<{ list: WishList }>(`/lists/${id}`, data).pipe(
      tap(response => {
        if (response.data?.list) {
          // Update list in the array
          this.listsSignal.update(lists =>
            lists.map(list => list.id === id ? response.data!.list : list)
          );
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
   * Delete list
   */
  deleteList(id: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.delete(`/lists/${id}`).pipe(
      tap(() => {
        // Remove list from array
        this.listsSignal.update(lists => lists.filter(list => list.id !== id));
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
   * Get public shared list (no auth required)
   */
  getSharedList(shareId: string) {
    this.isLoadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<{ list: any; items: any[] }>(`/lists/share/${shareId}`).pipe(
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


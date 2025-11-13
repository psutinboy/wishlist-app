import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ListService, WishList } from '../../services/list.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly listService = inject(ListService);
  private readonly fb = inject(FormBuilder);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly lists = this.listService.lists;
  protected readonly isLoading = this.listService.isLoading;
  protected readonly error = this.listService.error;

  protected readonly showCreateModal = signal(false);
  protected readonly isCreating = signal(false);

  protected readonly createListForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    isPublic: [true]
  });

  ngOnInit(): void {
    this.loadLists();
  }

  protected loadLists(): void {
    this.listService.getLists().subscribe();
  }

  protected openCreateModal(): void {
    this.showCreateModal.set(true);
    this.createListForm.reset({ title: '', isPublic: true });
  }

  protected closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.createListForm.reset();
  }

  protected createList(): void {
    if (this.createListForm.invalid || this.isCreating()) {
      return;
    }

    this.isCreating.set(true);
    const { title, isPublic } = this.createListForm.getRawValue();

    this.listService.createList({ title, isPublic }).subscribe({
      next: () => {
        this.isCreating.set(false);
        this.closeCreateModal();
      },
      error: () => {
        this.isCreating.set(false);
      }
    });
  }

  protected deleteList(list: WishList, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete "${list.title}"? This will also delete all items and claims.`)) {
      return;
    }

    this.listService.deleteList(list.id).subscribe();
  }

  protected getShareUrl(list: WishList): string {
    return `${window.location.origin}/l/${list.shareId}`;
  }

  protected copyShareUrl(list: WishList, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    
    const url = this.getShareUrl(list);
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied to clipboard!');
    });
  }

  protected logout(): void {
    this.authService.logout().subscribe();
  }
}


import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ListService, WishList } from '../../services/list.service';
import { ItemService, WishItem, CreateItemData, UpdateItemData } from '../../services/item.service';

@Component({
  selector: 'app-list-detail',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './list-detail.component.html',
  styleUrl: './list-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly itemService = inject(ItemService);
  private readonly fb = inject(FormBuilder);

  protected readonly list = signal<WishList | null>(null);
  protected readonly items = signal<WishItem[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly showItemModal = signal(false);
  protected readonly editingItem = signal<WishItem | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly isPreviewLoading = signal(false);

  protected readonly itemForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    url: [''],
    price: [null as number | null],
    imageUrl: [''],
    category: ['', [Validators.maxLength(50)]],
    priority: ['medium' as 'high' | 'medium' | 'low'],
    notes: ['', [Validators.maxLength(500)]]
  });

  // Group items by category
  protected readonly groupedItems = computed(() => {
    const allItems = this.items();
    const groups: { [key: string]: WishItem[] } = {};
    
    allItems.forEach(item => {
      const category = item.category || 'Uncategorized';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
    });

    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return a.localeCompare(b);
    });
  });

  ngOnInit(): void {
    const listId = this.route.snapshot.paramMap.get('id');
    if (listId) {
      this.loadList(listId);
    }
  }

  protected loadList(id: string): void {
    this.isLoading.set(true);
    this.listService.getList(id).subscribe({
      next: (response) => {
        if (response.data) {
          this.list.set(response.data.list);
          this.items.set(response.data.items || []);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.isLoading.set(false);
      }
    });
  }

  protected openAddItemModal(): void {
    this.editingItem.set(null);
    this.itemForm.reset({
      title: '',
      url: '',
      price: null,
      imageUrl: '',
      category: '',
      priority: 'medium',
      notes: ''
    });
    this.showItemModal.set(true);
  }

  protected openEditItemModal(item: WishItem): void {
    this.editingItem.set(item);
    this.itemForm.patchValue({
      title: item.title,
      url: item.url || '',
      price: item.price || null,
      imageUrl: item.imageUrl || '',
      category: item.category || '',
      priority: item.priority || 'medium',
      notes: item.notes || ''
    });
    this.showItemModal.set(true);
  }

  protected closeItemModal(): void {
    this.showItemModal.set(false);
    this.editingItem.set(null);
    this.itemForm.reset();
  }

  protected previewUrl(): void {
    const url = this.itemForm.controls.url.value;
    if (!url || !url.startsWith('https://')) {
      return;
    }

    this.isPreviewLoading.set(true);
    this.itemService.previewUrl(url).subscribe({
      next: (response) => {
        if (response.data?.metadata) {
          const metadata = response.data.metadata;
          if (metadata.title && !this.itemForm.controls.title.value) {
            this.itemForm.controls.title.setValue(metadata.title);
          }
          if (metadata.imageUrl) {
            this.itemForm.controls.imageUrl.setValue(metadata.imageUrl);
          }
          if (metadata.price) {
            this.itemForm.controls.price.setValue(metadata.price);
          }
        }
        this.isPreviewLoading.set(false);
      },
      error: () => {
        this.isPreviewLoading.set(false);
      }
    });
  }

  protected saveItem(): void {
    if (this.itemForm.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    const formValue = this.itemForm.getRawValue();
    const currentList = this.list();

    if (!currentList) {
      return;
    }

    const editing = this.editingItem();

    if (editing) {
      // Update existing item
      const updateData: UpdateItemData = {
        ...formValue,
        price: formValue.price ?? undefined,
        url: formValue.url || undefined,
        imageUrl: formValue.imageUrl || undefined,
        category: formValue.category || undefined,
        notes: formValue.notes || undefined
      };

      this.itemService.updateItem(editing.id, updateData).subscribe({
        next: (response) => {
          if (response.data?.item) {
            this.items.update(items => 
              items.map(item => item.id === editing.id ? response.data!.item : item)
            );
          }
          this.isSubmitting.set(false);
          this.closeItemModal();
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
    } else {
      // Create new item
      const createData: CreateItemData = {
        listId: currentList.id,
        ...formValue,
        price: formValue.price ?? undefined,
        url: formValue.url || undefined,
        imageUrl: formValue.imageUrl || undefined,
        category: formValue.category || undefined,
        notes: formValue.notes || undefined
      };

      this.itemService.createItem(createData).subscribe({
        next: (response) => {
          if (response.data?.item) {
            this.items.update(items => [response.data!.item, ...items]);
          }
          this.isSubmitting.set(false);
          this.closeItemModal();
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
    }
  }

  protected deleteItem(item: WishItem): void {
    if (!confirm(`Are you sure you want to delete "${item.title}"?`)) {
      return;
    }

    this.itemService.deleteItem(item.id).subscribe({
      next: () => {
        this.items.update(items => items.filter(i => i.id !== item.id));
      }
    });
  }

  protected formatPrice(cents: number | undefined): string {
    if (!cents) return '';
    return `$${(cents / 100).toFixed(2)}`;
  }

  protected getPriorityClass(priority?: string): string {
    switch (priority) {
      case 'high': return 'priority-high';
      case 'low': return 'priority-low';
      default: return 'priority-medium';
    }
  }

  protected getShareUrl(): string {
    const currentList = this.list();
    if (!currentList) return '';
    return `${window.location.origin}/l/${currentList.shareId}`;
  }

  protected copyShareUrl(): void {
    const url = this.getShareUrl();
    navigator.clipboard.writeText(url).then(() => {
      alert('Share link copied to clipboard!');
    });
  }
}


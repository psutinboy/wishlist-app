import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ListService } from '../../services/list.service';
import { ClaimService } from '../../services/claim.service';
import { WishItem } from '../../services/item.service';

interface PublicList {
  title: string;
  ownerName: string;
  createdAt: Date;
}

@Component({
  selector: 'app-public-list',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './public-list.component.html',
  styleUrl: './public-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly listService = inject(ListService);
  private readonly claimService = inject(ClaimService);
  private readonly fb = inject(FormBuilder);

  protected readonly list = signal<PublicList | null>(null);
  protected readonly items = signal<WishItem[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly showClaimModal = signal(false);
  protected readonly selectedItem = signal<WishItem | null>(null);
  protected readonly isClaiming = signal(false);

  protected readonly claimForm = this.fb.nonNullable.group({
    claimerName: ['', [Validators.required, Validators.maxLength(100)]],
    claimerNote: ['', [Validators.maxLength(200)]]
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
    const shareId = this.route.snapshot.paramMap.get('shareId');
    if (shareId) {
      this.loadSharedList(shareId);
    }
  }

  protected loadSharedList(shareId: string): void {
    this.isLoading.set(true);
    this.listService.getSharedList(shareId).subscribe({
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

  protected openClaimModal(item: WishItem): void {
    if (item.isClaimed) {
      return;
    }
    
    this.selectedItem.set(item);
    this.claimForm.reset({
      claimerName: '',
      claimerNote: ''
    });
    this.showClaimModal.set(true);
  }

  protected closeClaimModal(): void {
    this.showClaimModal.set(false);
    this.selectedItem.set(null);
    this.claimForm.reset();
  }

  protected claimItem(): void {
    if (this.claimForm.invalid || this.isClaiming()) {
      return;
    }

    const item = this.selectedItem();
    if (!item) {
      return;
    }

    this.isClaiming.set(true);
    const { claimerName, claimerNote } = this.claimForm.getRawValue();

    this.claimService.claimItem({
      itemId: item.id,
      claimerName,
      claimerNote: claimerNote || undefined
    }).subscribe({
      next: (response) => {
        if (response.data?.claim) {
          // Store claim token locally
          this.claimService.storeClaimToken(
            item.id,
            response.data.claim.id,
            response.data.claim.secretToken
          );

          // Update item as claimed
          this.items.update(items =>
            items.map(i => i.id === item.id ? { ...i, isClaimed: true } : i)
          );

          alert('Item claimed successfully! Your secret token has been saved locally.');
        }
        this.isClaiming.set(false);
        this.closeClaimModal();
      },
      error: () => {
        this.isClaiming.set(false);
      }
    });
  }

  protected unclaimItem(item: WishItem): void {
    const claimData = this.claimService.getClaimToken(item.id);
    if (!claimData) {
      alert('No claim token found for this item');
      return;
    }

    if (!confirm('Are you sure you want to unclaim this item?')) {
      return;
    }

    this.claimService.unclaimItem(claimData.claimId, claimData.token).subscribe({
      next: () => {
        // Remove claim token
        this.claimService.removeClaimToken(item.id);

        // Update item as unclaimed
        this.items.update(items =>
          items.map(i => i.id === item.id ? { ...i, isClaimed: false } : i)
        );

        alert('Item unclaimed successfully');
      }
    });
  }

  protected canUnclaim(item: WishItem): boolean {
    return !!this.claimService.getClaimToken(item.id);
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

  protected openItemUrl(item: WishItem): void {
    if (item.url) {
      window.open(item.url, '_blank');
    } else {
      alert("This item doesn't have a link");
    }
  }
}


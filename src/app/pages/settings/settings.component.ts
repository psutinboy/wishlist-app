import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);
  private readonly fb = inject(FormBuilder);

  protected readonly currentUser = this.authService.currentUser;
  protected readonly activeTab = signal<'account' | 'preferences' | 'data' | 'danger'>('account');
  
  protected readonly isUpdating = signal(false);
  protected readonly isExporting = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly accountForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]]
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required, Validators.minLength(8)]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]]
  });

  protected readonly preferencesForm = this.fb.nonNullable.group({
    defaultListVisibility: [true],
    theme: ['system' as 'light' | 'dark' | 'system'],
    allowClaimsByDefault: [true]
  });

  protected readonly deleteForm = this.fb.nonNullable.group({
    password: ['', [Validators.required]],
    confirmation: ['', [Validators.required]]
  });

  ngOnInit(): void {
    const user = this.currentUser();
    if (user) {
      this.accountForm.patchValue({
        displayName: user.displayName,
        email: user.email
      });

      this.preferencesForm.patchValue({
        defaultListVisibility: user.preferences?.defaultListVisibility ?? true,
        theme: user.preferences?.theme || 'system',
        allowClaimsByDefault: user.preferences?.allowClaimsByDefault ?? true
      });
    }
  }

  protected setActiveTab(tab: 'account' | 'preferences' | 'data' | 'danger'): void {
    this.activeTab.set(tab);
    this.clearMessages();
  }

  protected updateAccount(): void {
    if (this.accountForm.invalid || this.isUpdating()) {
      return;
    }

    this.isUpdating.set(true);
    this.clearMessages();

    const { displayName, email } = this.accountForm.getRawValue();

    this.apiService.patch<{ user: any }>('/users/settings', { displayName, email }).subscribe({
      next: (response) => {
        if (response.data?.user) {
          this.authService.updateUser(response.data.user);
          this.successMessage.set('Account updated successfully');
        }
        this.isUpdating.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message);
        this.isUpdating.set(false);
      }
    });
  }

  protected updatePassword(): void {
    if (this.passwordForm.invalid || this.isUpdating()) {
      return;
    }

    this.isUpdating.set(true);
    this.clearMessages();

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();

    this.apiService.patch('/users/settings', { currentPassword, newPassword }).subscribe({
      next: () => {
        this.successMessage.set('Password updated successfully');
        this.passwordForm.reset();
        this.isUpdating.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message);
        this.isUpdating.set(false);
      }
    });
  }

  protected updatePreferences(): void {
    if (this.preferencesForm.invalid || this.isUpdating()) {
      return;
    }

    this.isUpdating.set(true);
    this.clearMessages();

    const preferences = this.preferencesForm.getRawValue();

    this.apiService.patch<{ user: any }>('/users/settings', { preferences }).subscribe({
      next: (response) => {
        if (response.data?.user) {
          this.authService.updateUser(response.data.user);
          this.successMessage.set('Preferences updated successfully');
        }
        this.isUpdating.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message);
        this.isUpdating.set(false);
      }
    });
  }

  protected exportData(): void {
    if (this.isExporting()) {
      return;
    }

    this.isExporting.set(true);
    this.clearMessages();

    this.apiService.get('/users/export').subscribe({
      next: (response) => {
        // Create downloadable file
        const dataStr = JSON.stringify(response, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `wishlist-data-${Date.now()}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        this.successMessage.set('Data exported successfully');
        this.isExporting.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message);
        this.isExporting.set(false);
      }
    });
  }

  protected deleteAccount(): void {
    if (this.deleteForm.invalid || this.isDeleting()) {
      return;
    }

    const { password, confirmation } = this.deleteForm.getRawValue();

    if (confirmation !== 'DELETE') {
      this.errorMessage.set('Please type DELETE to confirm');
      return;
    }

    if (!confirm('Are you absolutely sure? This action CANNOT be undone. All your lists, items, and claims will be permanently deleted.')) {
      return;
    }

    this.isDeleting.set(true);
    this.clearMessages();

    this.apiService.delete('/users/delete', { body: { password, confirmation } }).subscribe({
      next: () => {
        alert('Your account has been deleted successfully. You will be redirected to the login page.');
        // Logout will be handled by the response
        this.isDeleting.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message);
        this.isDeleting.set(false);
      }
    });
  }

  protected clearMessages(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  protected getSupportEmail(): string {
    return 'mailto:support@wishlist-app.com';
  }
}


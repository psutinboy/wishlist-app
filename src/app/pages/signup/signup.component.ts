import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupComponent {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly isSubmitting = signal(false);

  protected readonly signupForm = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(1), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]]
  });

  // Expose auth service state
  protected readonly isLoading = this.authService.isLoading;
  protected readonly error = this.authService.error;

  protected onSubmit(): void {
    if (this.signupForm.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.authService.clearError();

    const { email, password, displayName } = this.signupForm.getRawValue();

    this.authService.signup({ email, password, displayName }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
      },
      error: () => {
        this.isSubmitting.set(false);
      }
    });
  }
}


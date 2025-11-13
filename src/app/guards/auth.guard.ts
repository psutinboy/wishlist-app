import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check if user is already loaded
  if (authService.isAuthenticated()) {
    return true;
  }

  // Try to load user from server
  return authService.checkAuth().pipe(
    take(1),
    map(response => {
      if (authService.isAuthenticated()) {
        return true;
      } else {
        router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      }
    })
  );
};


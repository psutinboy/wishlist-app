import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { inject as injectAnalytics } from '@vercel/analytics';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly authService = inject(AuthService);
  protected readonly title = signal('wishlist-app');

  ngOnInit(): void {
    injectAnalytics();
    
    // Check if user is authenticated on app initialization
    // This will restore the session if a valid token exists
    this.authService.checkAuth().subscribe();
  }
}

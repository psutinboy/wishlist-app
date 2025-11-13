import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

interface HttpOptions {
  headers?: HttpHeaders | { [header: string]: string | string[] };
  context?: HttpContext;
  params?:
    | HttpParams
    | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean> };
  reportProgress?: boolean;
  responseType?: 'json';
  body?: any;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(endpoint: string, options?: HttpOptions): Observable<ApiResponse<T>> {
    return this.http
      .get<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, {
        ...options,
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  post<T>(endpoint: string, body: any, options?: HttpOptions): Observable<ApiResponse<T>> {
    return this.http
      .post<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, body, {
        ...options,
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  patch<T>(endpoint: string, body: any, options?: HttpOptions): Observable<ApiResponse<T>> {
    return this.http
      .patch<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, body, {
        ...options,
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  delete<T>(endpoint: string, options?: HttpOptions): Observable<ApiResponse<T>> {
    return this.http
      .delete<ApiResponse<T>>(`${this.baseUrl}${endpoint}`, {
        ...options,
        withCredentials: true,
      })
      .pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';

    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else if (error.error?.error) {
      // Server-side error with our standard format
      errorMessage = error.error.error;
    } else {
      // Other server-side errors
      errorMessage = `Error: ${error.status} - ${error.statusText}`;
    }

    console.error('API Error:', error);
    return throwError(() => new Error(errorMessage));
  }
}

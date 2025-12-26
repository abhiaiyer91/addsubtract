import { createTRPCProxyClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from './routers';

/**
 * Create a tRPC client for use in web apps or CLI
 *
 * @param baseUrl - The base URL of the tRPC server (e.g., 'http://localhost:3000')
 * @param token - Optional authentication token
 * @returns A typed tRPC client
 *
 * @example
 * ```ts
 * const client = createClient('http://localhost:3000', 'my-session-token');
 *
 * // Now you have full type safety!
 * const user = await client.auth.me.query();
 * const repos = await client.repos.list.query({ owner: 'octocat' });
 * ```
 */
export function createClient(baseUrl: string, token?: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        transformer: superjson,
        headers: () => {
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          return headers;
        },
      }),
    ],
  });
}

/**
 * Create a client with dynamic token support (for React apps with auth state)
 *
 * @param baseUrl - The base URL of the tRPC server
 * @param getToken - A function that returns the current auth token
 * @returns A typed tRPC client
 */
export function createClientWithTokenGetter(
  baseUrl: string,
  getToken: () => string | undefined
) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/trpc`,
        transformer: superjson,
        headers: () => {
          const token = getToken();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          return headers;
        },
      }),
    ],
  });
}

/**
 * Type helper to check if an error is a tRPC error
 */
export function isTRPCClientError(error: unknown): error is TRPCClientError<AppRouter> {
  return error instanceof TRPCClientError;
}

/**
 * Export AppRouter type for consumers
 */
export type { AppRouter };

/**
 * Re-export useful types from tRPC
 */
export { TRPCClientError } from '@trpc/client';

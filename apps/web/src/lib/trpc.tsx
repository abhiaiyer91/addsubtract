import { useState } from 'react';
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, splitLink, unstable_httpSubscriptionLink } from '@trpc/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import superjson from 'superjson';
import type { AppRouter } from './api-types';

export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: unstable_httpSubscriptionLink({
            url: `${apiUrl}/trpc`,
            transformer: superjson,
          }),
          false: httpBatchLink({
            url: `${apiUrl}/trpc`,
            // Use cookies for authentication (better-auth)
            fetch: (url, options) => {
              return fetch(url, {
                ...options,
                credentials: 'include', // Include cookies in requests
              });
            },
            transformer: superjson,
          }),
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

export { QueryClient, QueryClientProvider };

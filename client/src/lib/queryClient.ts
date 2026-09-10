import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { contextFetch, type RequestContext } from '@/features/account/runtime';

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Server request failed (${status}).`);
    this.name = 'ApiError';
  }
}

async function throwIfResNotOk(res: Response) {
  // Private server response bodies must not be copied into browser logs or UI.
  if (!res.ok) throw new ApiError(res.status);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  context?: RequestContext,
): Promise<Response> {
  const res = await contextFetch(method, url, data, context);

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await contextFetch('GET', queryKey[0] as string);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

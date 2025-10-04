import { QueryClient, QueryFunction } from "@tanstack/react-query";

// API base URL configuration for mobile vs web
const getApiBaseUrl = () => {
  // For mobile app builds, use the production API URL
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // For web builds, use relative URLs (current behavior)
  return '';
};

const API_BASE_URL = getApiBaseUrl();

// Helper function to build complete URLs
const buildApiUrl = (url: string): string => {
  if (url.startsWith('http') || !API_BASE_URL) {
    return url; // Already absolute or no base URL configured
  }
  return `${API_BASE_URL}${url}`;
};

// Helper function to get auth headers (supports both session and token auth)
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {};
  
  // Check if running in Capacitor (mobile app)
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') {
    // Mobile app: use Bearer ID token authentication (backend validates ID tokens)
    try {
      const { getIdToken } = await import('./oauth');
      const idToken = await getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }
    } catch (error) {
      console.error('Failed to get ID token:', error);
    }
  }
  // Web: uses session cookies automatically via credentials: "include"
  
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const fullUrl = buildApiUrl(url);
  const authHeaders = await getAuthHeaders();
  
  const res = await fetch(fullUrl, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...authHeaders
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Use only the first element as the URL, rest are for cache scoping
    const url = typeof queryKey[0] === 'string' ? queryKey[0] : String(queryKey[0]);
    const fullUrl = buildApiUrl(url);
    const authHeaders = await getAuthHeaders();
    
    const res = await fetch(fullUrl, {
      credentials: "include",
      headers: authHeaders
    });

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

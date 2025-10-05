import { useQuery } from "@tanstack/react-query"
import { queryClient, getQueryFn } from "@/lib/queryClient"

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  })

  const login = async () => {
    // Check if running in Capacitor (mobile app)
    const isCapacitor = window.location.protocol === 'capacitor:' || 
                        window.location.protocol === 'ionic:';
    
    console.log('🔑 Login requested', { 
      protocol: window.location.protocol,
      isCapacitor,
      hasApiBaseUrl: !!import.meta.env.VITE_API_BASE_URL,
      hasReplId: !!import.meta.env.VITE_REPL_ID
    });
    
    if (isCapacitor) {
      // Mobile: use OAuth plugin for token-based authentication
      try {
        console.log('📱 Starting mobile OAuth flow...');
        const { performMobileOAuth } = await import('@/lib/oauth');
        const tokens = await performMobileOAuth();
        
        console.log('✅ Mobile OAuth succeeded, refreshing auth state...');
        
        // Refresh user data after successful OAuth
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        
        // Reload to ensure all state is fresh
        window.location.reload();
      } catch (error) {
        console.error('❌ Mobile OAuth failed:', error);
        // Error already shown to user via alert in performMobileOAuth
        throw error;
      }
    } else {
      // Web browser - use regular redirect to session-based OAuth
      const loginUrl = import.meta.env.VITE_API_BASE_URL 
        ? `${import.meta.env.VITE_API_BASE_URL}/api/login`
        : '/api/login';
      console.log('🌐 Redirecting to web login:', loginUrl);
      window.location.href = loginUrl;
    }
  }

  const logout = async () => {
    // Check if running in Capacitor (mobile app)
    const isCapacitor = window.location.protocol === 'capacitor:' || 
                        window.location.protocol === 'ionic:';
    
    if (isCapacitor) {
      // Mobile: clear tokens
      const { logout: clearTokens } = await import('@/lib/oauth');
      await clearTokens();
      
      // Reload to logged out state
      window.location.reload();
    } else {
      // Web browser - use regular logout endpoint
      const logoutUrl = import.meta.env.VITE_API_BASE_URL 
        ? `${import.meta.env.VITE_API_BASE_URL}/api/logout`
        : '/api/logout';
      window.location.href = logoutUrl;
    }
  }

  // Check if the error indicates the user is not authenticated (401)
  const isUnauthorized = error?.message?.includes("401")

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !isUnauthorized,
    login,
    logout,
    error,
  }
}
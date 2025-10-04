import { useQuery } from "@tanstack/react-query"

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  })

  const login = async () => {
    // Check if running in Capacitor (mobile app)
    const isCapacitor = window.location.protocol === 'capacitor:' || 
                        window.location.protocol === 'ionic:';
    
    if (isCapacitor) {
      // Mobile: Open OAuth in in-app browser (SFSafariViewController on iOS)
      // This shares cookies with the main WebView
      const { Browser } = await import('@capacitor/browser');
      const loginUrl = `${import.meta.env.VITE_API_BASE_URL}/api/login`;
      
      // Open in-app browser for OAuth
      await Browser.open({
        url: loginUrl,
        windowName: '_blank', // Opens in-app browser, not external
        toolbarColor: '#ffffff'
      });
      
      // Browser will be automatically closed by AuthCallback page after OAuth completes
    } else {
      // Web browser - use regular redirect
      const loginUrl = import.meta.env.VITE_API_BASE_URL 
        ? `${import.meta.env.VITE_API_BASE_URL}/api/login`
        : '/api/login';
      window.location.href = loginUrl;
    }
  }

  const logout = () => {
    // Navigate directly to logout endpoint to follow OAuth redirect chain
    const logoutUrl = import.meta.env.VITE_API_BASE_URL 
      ? `${import.meta.env.VITE_API_BASE_URL}/api/logout`
      : '/api/logout';
    window.location.href = logoutUrl;
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
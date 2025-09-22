import { useQuery } from "@tanstack/react-query"

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  })

  const login = async () => {
    // Check if running in Capacitor (mobile app)
    if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') {
      // Import Capacitor Browser for mobile OAuth
      const { Browser } = await import('@capacitor/browser');
      
      // Open OAuth in system browser for mobile
      const loginUrl = `${import.meta.env.VITE_API_BASE_URL || ''}/api/login`;
      await Browser.open({ 
        url: loginUrl,
        windowName: '_system'
      });
    } else {
      // Web browser - use regular redirect
      window.location.href = '/api/login';
    }
  }

  const logout = () => {
    // Navigate directly to logout endpoint to follow OAuth redirect chain
    window.location.href = '/api/logout'
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
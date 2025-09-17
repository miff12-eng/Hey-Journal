import { useQuery } from "@tanstack/react-query"

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  })

  const login = () => {
    // Redirect to OAuth login
    window.location.href = '/api/login'
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
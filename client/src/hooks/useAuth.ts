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

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    error,
  }
}
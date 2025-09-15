import { Switch, Route } from "wouter"
import { queryClient } from "./lib/queryClient"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/useAuth"
import NotFound from "@/pages/not-found"
import Landing from "@/pages/Landing"
import Home from "@/pages/Home"
import Record from "@/pages/Record"
import Search from "@/pages/Search"
import Chat from "@/pages/Chat"
import Profile from "@/pages/Profile"
import BottomNavigation from "@/components/BottomNavigation"

function Router() {
  const { isAuthenticated, isLoading } = useAuth()

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    )
  }

  // Show authenticated app with bottom navigation
  return (
    <div className="relative">
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/record" component={Record} />
        <Route path="/search" component={Search} />
        <Route path="/chat" component={Chat} />
        <Route path="/profile" component={Profile} />
        <Route component={NotFound} />
      </Switch>
      <BottomNavigation />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground">
          <Router />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
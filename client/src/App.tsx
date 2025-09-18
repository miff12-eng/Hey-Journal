import { Switch, Route, Redirect } from "wouter"
import { queryClient } from "./lib/queryClient"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/useAuth"
import NotFound from "@/pages/not-found"
import Landing from "@/pages/Landing"
import Home from "@/pages/Home"
import MyJournal from "@/pages/MyJournal"
import Search from "@/pages/Search"
import Profile from "@/pages/Profile"
import PublicSearch from "@/pages/PublicSearch"
import PublicProfile from "@/pages/PublicProfile"
import PublicEntry from "@/pages/PublicEntry"
import BottomNavigation from "@/components/BottomNavigation"

function Router() {
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <Switch>
      {/* Public routes - accessible without authentication */}
      <Route path="/public" component={PublicSearch} />
      <Route path="/u/:username" component={PublicProfile} />
      <Route path="/e/:entryId" component={PublicEntry} />
      
      {/* Catch-all for unknown public routes */}
      <Route path="/public/:rest+" component={NotFound} />
      <Route path="/u/:username/:rest+" component={NotFound} />
      <Route path="/e/:entryId/:rest+" component={NotFound} />

      {/* Main app routes */}
      <Route>
        {() => {
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
            return <Landing />
          }

          // Show authenticated app with bottom navigation
          return (
            <div className="relative">
              <Switch>
                <Route path="/" component={MyJournal} />
                <Route path="/my-journal" component={MyJournal} />
                <Route path="/record">{() => <Redirect to="/my-journal" />}</Route>
                <Route path="/search" component={Search} />
                <Route path="/profile" component={Profile} />
                <Route component={NotFound} />
              </Switch>
              <BottomNavigation />
            </div>
          )
        }}
      </Route>
      
      {/* Catch-all NotFound for invalid public paths */}
      <Route component={NotFound} />
    </Switch>
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
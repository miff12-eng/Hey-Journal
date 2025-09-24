import { Link, useLocation } from 'wouter'
import { Button } from '@/components/ui/button'
import { Home, Search, User, BookOpen, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  icon: React.ComponentType<{ className?: string }>
  label: string
  path: string
  testId: string
}

const navItems: NavItem[] = [
  { icon: BookOpen, label: 'My Journal', path: '/my-journal', testId: 'nav-my-journal' },
  { icon: Home, label: 'Feed', path: '/feed', testId: 'nav-feed' },
  { icon: Search, label: 'Search', path: '/search', testId: 'nav-search' },
  { icon: User, label: 'Profile', path: '/profile', testId: 'nav-profile' }
]

export default function BottomNavigation() {
  const [location] = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border safe-area-pb z-50">
      <div className="flex items-center justify-around px-2 py-1">
        {/* My Journal */}
        {(() => {
          const item = navItems[0]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-lg transition-colors',
                  isActive 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            </Link>
          )
        })()}
        
        {/* Feed */}
        {(() => {
          const item = navItems[1]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-lg transition-colors',
                  isActive 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            </Link>
          )
        })()}
        
        {/* Prominent New Entry Button */}
        <Link href="/my-journal?create=true">
          <Button
            size="sm"
            className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg border-2 border-primary"
            data-testid="nav-new-entry"
          >
            <Plus className="h-6 w-6" />
            <span className="text-xs font-bold">New Entry</span>
          </Button>
        </Link>
        
        {/* Search */}
        {(() => {
          const item = navItems[2]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-lg transition-colors',
                  isActive 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            </Link>
          )
        })()}
        
        {/* Profile */}
        {(() => {
          const item = navItems[3]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-lg transition-colors',
                  isActive 
                    ? 'text-primary bg-primary/10' 
                    : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className="text-xs font-medium">{item.label}</span>
              </Button>
            </Link>
          )
        })()}
      </div>
    </nav>
  )
}

// Add safe area padding for iOS devices
const style = `
  .safe-area-pb {
    padding-bottom: env(safe-area-inset-bottom);
  }
`

if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style')
  styleElement.textContent = style
  document.head.appendChild(styleElement)
}
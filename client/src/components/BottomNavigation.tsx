import { Link, useLocation } from 'wouter'
import { Home, Search, User, BookOpen, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHaptics } from '@/hooks/useHaptics'

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
  const [location, navigate] = useLocation()
  const { selection } = useHaptics()

  const handleTabClick = () => {
    selection()
  }

  const handleNewEntry = () => {
    handleTabClick()
    navigate('/my-journal?create=true')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border safe-area-pb z-50">
      <div className="flex items-center justify-around px-1 py-0">
        {/* My Journal */}
        {(() => {
          const item = navItems[0]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path} onClick={handleTabClick}>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-2 transition-colors no-default-hover-elevate no-default-active-elevate',
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground active:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-primary')} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </button>
            </Link>
          )
        })()}
        
        {/* Feed */}
        {(() => {
          const item = navItems[1]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path} onClick={handleTabClick}>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-2 transition-colors no-default-hover-elevate no-default-active-elevate',
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground active:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-primary')} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </button>
            </Link>
          )
        })()}
        
        {/* Prominent New Entry Button */}
        <button
          className="flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-2 rounded-full bg-primary text-primary-foreground active:opacity-80 transition-opacity shadow-md"
          data-testid="nav-new-entry"
          onClick={handleNewEntry}
        >
          <Plus className="h-7 w-7" />
          <span className="text-[10px] font-semibold leading-tight">New</span>
        </button>
        
        {/* Search */}
        {(() => {
          const item = navItems[2]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path} onClick={handleTabClick}>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-2 transition-colors no-default-hover-elevate no-default-active-elevate',
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground active:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-primary')} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </button>
            </Link>
          )
        })()}
        
        {/* Profile */}
        {(() => {
          const item = navItems[3]
          const isActive = location === item.path || (item.path !== '/' && location.startsWith(item.path))
          const Icon = item.icon
          return (
            <Link key={item.path} href={item.path} onClick={handleTabClick}>
              <button
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-2 transition-colors no-default-hover-elevate no-default-active-elevate',
                  isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground active:text-foreground'
                )}
                data-testid={item.testId}
              >
                <Icon className={cn('h-6 w-6', isActive && 'text-primary')} />
                <span className="text-[10px] font-medium leading-tight">{item.label}</span>
              </button>
            </Link>
          )
        })()}
      </div>
    </nav>
  )
}
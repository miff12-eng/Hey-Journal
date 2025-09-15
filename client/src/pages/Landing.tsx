import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mic, Bot, Lock, Smartphone, Zap, Users, Globe, Heart } from 'lucide-react'
import ThemeToggle from '@/components/ThemeToggle'

export default function Landing() {
  const features = [
    {
      icon: Mic,
      title: 'Voice-First Recording',
      description: "Capture thoughts naturally with advanced AI transcription that's more accurate than Siri"
    },
    {
      icon: Bot,
      title: 'AI-Powered Insights',
      description: 'Chat with your journal entries to discover patterns, find memories, and reflect deeply'
    },
    {
      icon: Lock,
      title: 'Privacy Controls',
      description: 'Keep entries private, share with friends, or make them public - you choose'
    },
    {
      icon: Smartphone,
      title: 'iOS Optimized',
      description: 'Beautiful progressive web app that works seamlessly on iPhone and iPad'
    }
  ]

  const benefits = [
    'Record thoughts instantly with voice',
    'AI transcription with 95%+ accuracy',
    'Search your memories with natural language',
    'Share moments with friends and family',
    'Discover patterns in your thinking',
    'Export your data anytime'
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Mic className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">Journal</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero section */}
      <main className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center space-y-8">
          {/* Hero content */}
          <div className="space-y-4">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <Zap className="h-3 w-3 mr-1" />
              Voice-Powered Journaling
            </Badge>
            
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight">
              Capture Your Thoughts
              <br />
              <span className="text-primary">Instantly</span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The most natural way to journal. Speak your thoughts, let AI transcribe them perfectly, 
              and discover insights about your life through intelligent conversations.
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button 
              size="lg" 
              className="text-base px-8 py-6"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-get-started"
            >
              Get Started Free
            </Button>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>10K+ users</span>
              </div>
              <div className="flex items-center gap-1">
                <Globe className="h-4 w-4" />
                <span>Works offline</span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                <span>Free forever</span>
              </div>
            </div>
          </div>

          {/* Features grid */}
          <div className="grid md:grid-cols-2 gap-6 mt-16">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <Card key={index} className="hover-elevate transition-all duration-200 cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                          {feature.title}
                        </h3>
                        <p className="text-muted-foreground leading-relaxed">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Benefits list */}
          <Card className="mt-12 bg-muted/50">
            <CardContent className="p-8">
              <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
                Everything you need to start journaling
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="h-2 w-2 bg-primary rounded-full" />
                    <span className="text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Final CTA */}
          <div className="mt-16 space-y-4">
            <h2 className="text-3xl font-bold text-foreground">
              Ready to start your journey?
            </h2>
            <p className="text-muted-foreground">
              Join thousands of people already using Journal to capture and reflect on their lives.
            </p>
            <Button 
              size="lg" 
              className="text-base px-8 py-6"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-start-journaling"
            >
              Start Journaling Now
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-24 border-t border-border">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <div className="h-6 w-6 bg-primary rounded-md flex items-center justify-center">
                <Mic className="h-3 w-3 text-primary-foreground" />
              </div>
              <span className="font-medium text-foreground">Journal</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Your thoughts, perfectly captured and beautifully organized.
            </p>
            <div className="flex justify-center gap-6 text-xs text-muted-foreground">
              <span>Privacy-first design</span>
              <span>•</span>
              <span>End-to-end encryption</span>
              <span>•</span>
              <span>Your data, your control</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
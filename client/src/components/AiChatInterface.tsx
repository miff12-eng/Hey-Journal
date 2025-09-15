import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Send, Bot, User, Mic, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AiChatMessage } from '@shared/schema'

interface AiChatInterfaceProps {
  messages?: AiChatMessage[]
  onSendMessage?: (message: string) => void
  onVoiceInput?: () => void
  isLoading?: boolean
  className?: string
}

export default function AiChatInterface({
  messages = [],
  onSendMessage,
  onVoiceInput,
  isLoading = false,
  className
}: AiChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('')
  const [isListening, setIsListening] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    if (inputValue.trim() && !isLoading) {
      onSendMessage?.(inputValue.trim())
      setInputValue('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleVoiceInput = () => {
    setIsListening(!isListening)
    onVoiceInput?.()
  }

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Journal Assistant
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Ask me anything about your journal entries, memories, or thoughts
        </p>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages */}
        <ScrollArea className="flex-1 px-6" ref={scrollAreaRef}>
          <div className="space-y-4 pb-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Start a conversation</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Ask me to find specific memories, analyze your mood patterns, or help you reflect on your entries.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  <Badge variant="outline" className="cursor-pointer hover-elevate" onClick={() => setInputValue('What did I write about last week?')}>
                    Recent entries
                  </Badge>
                  <Badge variant="outline" className="cursor-pointer hover-elevate" onClick={() => setInputValue('Show me my happiest memories')}>
                    Happy memories
                  </Badge>
                  <Badge variant="outline" className="cursor-pointer hover-elevate" onClick={() => setInputValue('What themes appear most in my journal?')}>
                    Common themes
                  </Badge>
                </div>
              </div>
            )}
            
            {messages.map((message, index) => (
              <div
                key={message.id || index}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
                data-testid={`message-${message.role}-${index}`}
              >
                {message.role === 'assistant' && (
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-12'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={cn(
                      'text-xs',
                      message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                    )}>
                      {formatTime(message.timestamp)}
                    </span>
                    
                    {message.relatedEntryIds && message.relatedEntryIds.length > 0 && (
                      <Badge variant="secondary" className="ml-2 h-5 text-xs">
                        <FileText className="h-3 w-3 mr-1" />
                        {message.relatedEntryIds.length} {message.relatedEntryIds.length === 1 ? 'entry' : 'entries'}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {message.role === 'user' && (
                  <Avatar className="h-8 w-8 mt-1">
                    <AvatarFallback className="bg-secondary text-secondary-foreground">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted text-foreground rounded-lg px-3 py-2 max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        {/* Input area */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your journal entries..."
                disabled={isLoading}
                className="pr-12"
                data-testid="input-ai-chat-message"
              />
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8',
                  isListening && 'text-destructive'
                )}
                onClick={handleVoiceInput}
                data-testid="button-voice-input"
              >
                <Mic className={cn('h-4 w-4', isListening && 'animate-pulse')} />
              </Button>
            </div>
            
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
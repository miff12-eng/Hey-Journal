import AiChatInterface from '@/components/AiChatInterface'
import ThemeToggle from '@/components/ThemeToggle'
import { AiChatMessage } from '@shared/schema'
import { useState } from 'react'
import { apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'

export default function Chat() {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const { toast } = useToast()

  const handleSendMessage = async (message: string) => {
    const userMessage: AiChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }
    
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    
    try {
      const response = await apiRequest('POST', '/api/ai/chat', {
        message,
        conversationId
      })

      if (response.ok) {
        const data = await response.json()
        setMessages(prev => [...prev, data.message])
        
        // Update conversation ID for future messages
        if (data.conversationId && !conversationId) {
          setConversationId(data.conversationId)
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.type === 'quota_exceeded') {
          throw new Error('OpenAI quota exceeded. Please check your API billing.');
        } else if (errorData.type === 'rate_limit') {
          throw new Error('Rate limit reached. Please try again in a moment.');
        } else {
          throw new Error(errorData.error || 'Failed to get AI response');
        }
      }
    } catch (error) {
      console.error('AI Chat Error:', error)
      toast({
        title: "Error",
        description: "Failed to get AI response. Please try again.",
        variant: "destructive"
      })
      
      // Remove the user message if AI response fails
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id))
    }
    
    setIsLoading(false)
  }

  const handleVoiceInput = () => {
    console.log('Voice input for chat triggered')
    // todo: implement voice input for chat
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">Chat about your journal entries</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Chat interface */}
      <div className="flex-1 pb-16"> {/* Bottom padding for navigation */}
        <AiChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          onVoiceInput={handleVoiceInput}
          isLoading={isLoading}
          className="h-full border-0 rounded-none"
        />
      </div>
    </div>
  )
}
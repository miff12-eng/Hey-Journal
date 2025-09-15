import AiChatInterface from '@/components/AiChatInterface'
import ThemeToggle from '@/components/ThemeToggle'
import { AiChatMessage } from '@shared/schema'
import { useState } from 'react'

export default function Chat() {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleSendMessage = async (message: string) => {
    const userMessage: AiChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }
    
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)
    
    // Simulate AI response - todo: replace with real AI integration
    setTimeout(() => {
      const aiResponse: AiChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I understand you're asking about "${message}". Based on your journal entries, I can help you explore your thoughts and memories. This is a demo response - in the real app, I would analyze your actual journal content using OpenAI GPT-4 to provide meaningful insights.`,
        timestamp: new Date().toISOString(),
        relatedEntryIds: ['entry1', 'entry2']
      }
      
      setMessages(prev => [...prev, aiResponse])
      setIsLoading(false)
    }, 1500)
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
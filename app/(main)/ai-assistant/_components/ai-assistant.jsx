"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import useStreamFetch from "@/hooks/use-stream-fetch";
import StreamedText, { markdownComponents } from "@/components/streamed-text";
import ReactMarkdown from "react-markdown";

export default function AIAssistant() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const scrollRef = useRef(null);
  const { streamedText, isLoading, error, startStream, reset } = useStreamFetch();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamedText, messages]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");

    await startStream(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (!isLoading && streamedText) {
      setMessages((prev) => [...prev, { role: "assistant", content: streamedText }]);
      reset();
    }
  }, [isLoading]);

  const clearChat = () => {
    setMessages([]);
    reset();
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-6xl font-bold gradient-title">AI Assistant</h1>
          <p className="text-muted-foreground mt-1">
            Ask anything about your career, resume, or interview prep
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        )}
      </div>

      <Card className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
        {/* Messages area */}
        <CardContent
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 p-4"
        >
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Bot className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">Ask me anything</p>
              <p className="text-sm mt-1">
                I can help with career advice, resume tips, interview prep, and more
              </p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${
                msg.role === "user" ? "justify-end" : ""
              }`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`rounded-lg px-4 py-2.5 max-w-[80%] text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted prose prose-sm dark:prose-invert max-w-none"
                }`}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === "user" && (
                <div className="shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* Streaming response — shown while AI is generating */}
          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="rounded-lg px-4 py-2.5 max-w-[80%] bg-muted prose prose-sm dark:prose-invert max-w-none">
                <StreamedText
                  text={streamedText}
                  isLoading={isLoading}
                  error={error}
                  emptyMessage="Thinking..."
                />
              </div>
            </div>
          )}

          {/* Error state for non-streaming errors */}
          {!isLoading && error && (
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-destructive" />
              </div>
              <div className="rounded-lg px-4 py-2.5 max-w-[80%] bg-destructive/5 text-destructive text-sm">
                Generation failed. Please try again.
              </div>
            </div>
          )}
        </CardContent>

        {/* Input area */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !input.trim()}
              className="shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

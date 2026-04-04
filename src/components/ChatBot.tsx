import { useState, useRef, useEffect } from "react";
import { Bot, X, Sparkles, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMeetingStore } from "@/hooks/useMeetingStore";
import { useSearchParams } from "react-router-dom";

type Message = { role: "user" | "assistant"; content: string };
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function ChatBot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawView = searchParams.get("tab");
  
  const [isOpen, setIsOpen] = useState(rawView === "ask-ai");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "<p>Hi, I’m MeetingMind AI Assistant. Ask me about a meeting, summary, or action item and I’ll help.</p>" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { meetings } = useMeetingStore();

  useEffect(() => {
    if (rawView === "ask-ai") setIsOpen(true);
  }, [rawView]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    if (rawView === "ask-ai") {
      setSearchParams({ tab: "reports" });
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
  };

  const submitQuery = async () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const recentMeetingsContext = meetings.slice(0, 5).map(m => {
        return `Title: ${m.title || "Meeting"}\nDate: ${m.date}\nSummary: ${m.summary?.executiveSummary || "No summary yet"}\nAction Items: ${m.summary?.actionItems?.map(a => a.task).join(", ") || "None"}\n`;
      }).join("\n---\n");

      const promptContext = `You are MeetingMind AI Assistant, a smart and friendly assistant that helps users manage meetings, summaries, and actions.

Your goal is to respond like ChatGPT:
- Natural and conversational
- Clear and helpful
- Not robotic or generic

STRICT RULES:
- Do NOT say phrases like "there are several options", "you can consider", or "it depends"
- Do NOT give long bullet lists unless the user clearly asks for them
- Always give a direct answer first
- Then explain briefly only if needed
- Keep responses short, useful, and human-like

STYLE:
- Talk like a helpful teammate
- Use simple English
- Be confident and clear
- Avoid over-explaining
- If steps are needed, give 2 to 4 clean steps max

BEHAVIOR:
- If the user asks how to send a summary to email, answer directly and then give short practical steps
- If a feature exists, explain how to use it
- If a feature does not exist, suggest the simplest way to implement it
- Always prioritize practical answers over theory

FORMATTING RULES:
- Do NOT use Markdown
- Use simple HTML only: <p>, <strong>, <ul>, <ol>, <li>, <br>
- Start with one short <p> that gives the direct answer
- Use a short list only when steps make the answer clearer

MEETING CONTEXT:
${recentMeetingsContext || "No recorded meetings yet."}`;

      const chatEndpoint = API_BASE_URL ? `${API_BASE_URL}/chat` : "/chat";
      const res = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: userMessage,
          context: promptContext,
          history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
        })
      });

      const data = await res.json();

      if (!res.ok) {
         throw new Error(data.error || data.message || "Failed to fetch from the chat API");
      }

      const responseText = data.response || "<p>I received your message.</p>";
      setMessages(prev => [...prev, { role: "assistant", content: responseText }]);
      
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: "assistant", content: "<p>I’m having trouble connecting right now. Please try again in a moment.</p>" }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Safe fallback to deal with any rogue markdown
  const parseMarkdownFallback = (text: string) => {
    const withBold = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-white">$1</strong>');

    if (/<(p|ul|ol|li|strong|br)\b/i.test(withBold)) {
      return withBold;
    }

    const sections = withBold
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sections.length === 0) {
      return "<p></p>";
    }

    const html = sections
      .map((part) => {
        const lines = part.split("\n").map((line) => line.trim()).filter(Boolean);
        const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line));

        if (bulletLines.length === lines.length && bulletLines.length > 0) {
          return `<ul>${bulletLines.map((line) => `<li>${line.replace(/^[-*]\s+/, "")}</li>`).join("")}</ul>`;
        }

        return `<p>${part.replace(/\n/g, "<br>")}</p>`;
      })
      .join("");

    return html;
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isOpen && (
          <div className="bg-[#f0f2f5] w-[380px] sm:w-[420px] h-[600px] max-h-[85vh] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] rounded-3xl border border-white/50 flex flex-col mb-4 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Minimal Transparent Header */}
            <div className="p-4 flex items-center justify-between z-10 sticky top-0 bg-gradient-to-b from-[#f0f2f5] to-transparent">
              <div className="flex flex-col">
                <h3 className="font-semibold text-gray-800 text-[15px]">Ask AI</h3>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose} className="hover:bg-gray-200/50 text-gray-500 rounded-full h-8 w-8 transition-colors">
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 px-4 overflow-y-auto flex flex-col gap-5 pb-4">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex gap-3 max-w-[90%] ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                   {m.role === "assistant" && (
                     <div className="shrink-0 h-[28px] w-[28px] mt-1 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-md">
                       <Bot className="h-4 w-4 text-white" />
                     </div>
                   )}
                   
                   {m.role === "user" ? (
                     <div className="px-5 py-3 rounded-[24px] rounded-br-[4px] text-[14px] font-medium leading-relaxed bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md">
                       {m.content}
                     </div>
                   ) : (
                     <div 
                       className="p-4 rounded-[24px] rounded-tl-[4px] text-[14px] leading-relaxed bg-white text-gray-900 font-medium shadow-sm border border-gray-200 prose prose-sm max-w-none prose-p:my-1 prose-ul:my-2 prose-li:my-0 prose-strong:font-bold prose-strong:text-black"
                       dangerouslySetInnerHTML={{ __html: parseMarkdownFallback(m.content) }}
                     />
                   )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 max-w-[90%] mr-auto items-center">
                   <div className="shrink-0 h-[28px] w-[28px] rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-md">
                     <Sparkles className="h-4 w-4 text-white" />
                   </div>
                   <div className="text-[13px] text-gray-500 font-medium flex items-center gap-2">
                     <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing data, please wait...
                   </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area Matching Screenshot */}
            <div className="p-4 bg-transparent flex flex-col gap-3 pb-6">
              <div className="flex gap-2 mb-1 px-2">
                <span onClick={() => handleSuggestion("Summarize key points")} className="px-3 py-1.5 bg-white text-gray-600 rounded-full text-[12px] font-medium hover:bg-gray-50 cursor-pointer transition-colors shadow-sm border border-gray-100 select-none">
                  Summarize key points
                </span>
                <span onClick={() => handleSuggestion("Identify actionable tasks")} className="px-3 py-1.5 bg-white text-gray-600 rounded-full text-[12px] font-medium hover:bg-gray-50 cursor-pointer transition-colors shadow-sm border border-gray-100 select-none">
                  Identify actionable tasks
                </span>
              </div>
              
              <div className="relative flex items-center shadow-lg shadow-black/5 rounded-[24px] bg-white border border-gray-100 p-[3px]">
                <Input 
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitQuery()}
                  placeholder="Ask, write or search for anything..."
                  className="pr-12 pl-4 py-3 h-12 text-[14px] text-gray-900 placeholder:text-gray-400 caret-gray-900 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent shadow-none [-webkit-text-fill-color:#111827]"
                  disabled={isLoading}
                />
                <Button 
                   size="icon" 
                   onClick={submitQuery}
                   disabled={!input.trim() || isLoading}
                   className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black hover:bg-gray-800 text-white flex items-center justify-center transition-transform active:scale-95 disabled:bg-gray-300 disabled:opacity-50"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toggle Button */}
        {!isOpen && (
          <Button 
            onClick={() => setIsOpen(true)}
            className="h-14 w-14 rounded-full shadow-xl bg-gradient-to-br from-indigo-500 to-purple-500 border border-white/20 text-white flex items-center justify-center hover:scale-105 transition-transform"
          >
            <Sparkles className="h-6 w-6" />
          </Button>
        )}
      </div>
    </>
  );
}

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import {
  initialChatMessages,
  suggestedQuestions,
  businessSuggestedQuestions,
  type UserMode,
} from "../lib/data";
import { api } from "../lib/api";
import { useSelectedAccount } from "../lib/accountStore";
import { consumeDraft } from "../lib/chatHandoff";
import { cn } from "../lib/utils";
import { EASE } from "../animations/variants";

type Message = { id: number; sender: "user" | "advisor"; text: string };

const businessInitialMessages: Message[] = [
  {
    id: 1,
    sender: "advisor",
    text: "أهلاً بكم! أنا مستشار الأعمال في مُرتقى. أقرأ تدفقات منشأتكم النقدية وأجيب عن أسئلة التمويل والتوقيت. كيف أساعدكم اليوم؟",
  },
];

export function Chat({ mode = "individuals" }: { mode?: UserMode }) {
  const isBusiness = mode === "business";
  const initial = isBusiness ? businessInitialMessages : initialChatMessages;
  const questions = isBusiness ? businessSuggestedQuestions : suggestedQuestions;

  const account = useSelectedAccount(isBusiness ? "business" : "individuals");

  const [messages, setMessages] = useState<Message[]>(initial);
  // Part 7 — a staged "Ask the Advisor" draft from another screen pre-fills the composer (never
  // auto-sent: the user still reviews/edits/sends it themselves).
  const [input, setInput] = useState(() => consumeDraft() ?? "");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialCount = initial.length;

  // Switching account starts a fresh conversation: the replies already on screen are grounded in
  // the PREVIOUS customer's real figures, and leaving them visible would attribute one person's
  // numbers to another.
  useEffect(() => {
    setMessages(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const appendAdvisor = (text: string) =>
    setMessages((prev) => [...prev, { id: Date.now() + 1, sender: "advisor", text }]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    setMessages((prev) => [...prev, { id: Date.now(), sender: "user", text: trimmed }]);
    setInput("");
    setTyping(true);

    // Both modes → live ALLaM advisor via the FastAPI bridge (SME advisor for business).
    try {
      const { text: reply } = isBusiness
        ? await api.sendBusinessChatMessage(trimmed)
        : await api.sendChatMessage(trimmed);
      appendAdvisor(reply);
    } catch {
      appendAdvisor(
        "تعذّر الوصول إلى المستشار الذكي حالياً. تأكد من تشغيل الخدمة ثم حاول مرة أخرى."
      );
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 4.75rem)" }} dir="rtl">
      {/* Header — dark advisor stage */}
      <div className="relative overflow-hidden bg-espresso px-5 md:px-8 py-4 flex items-center justify-between gap-3 shrink-0">
        <div className="pointer-events-none absolute -top-10 -start-10 w-48 h-48 rounded-full bg-copper/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="relative w-11 h-11 rounded-full bg-gold flex items-center justify-center">
            <MessageCircle size={19} className="text-espresso" />
            <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full bg-positive ring-2 ring-espresso" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">
              {isBusiness ? "مستشار الأعمال الذكي" : "المستشار المالي الذكي"}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-positive" />
              <span className="text-xs text-white/55">متصل الآن</span>
            </div>
          </div>
        </div>
        <span className="relative hidden sm:inline-flex items-center gap-1.5 rounded-full bg-white/8 border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/80">
          <Sparkles size={12} className="text-gold" />
          مدعوم بنموذج ALLaM العربي
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-warm px-4 md:px-8 py-6 space-y-4 bg-cream">
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} msg={msg} delay={i < initialCount ? i * 0.1 : 0} />
        ))}

        <AnimatePresence>{typing && <TypingIndicator />}</AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Suggested questions + floating composer */}
      <div className="px-4 md:px-8 pb-5 pt-2 shrink-0 bg-gradient-to-t from-cream via-cream to-transparent">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
          {questions.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="whitespace-nowrap text-xs bg-card border border-copper/25 text-copper px-4 py-2 rounded-full hover:bg-copper-tint hover:border-copper/40 transition-colors shrink-0 font-medium shadow-[var(--shadow-sm)]"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-card rounded-full border border-line ps-5 pe-2 py-2 shadow-[var(--shadow-lg)] focus-within:border-copper/50 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder={isBusiness ? "اسأل عن أي شيء في أعمالك…" : "اسأل عن أي شيء في أموالك…"}
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder-ink-faint"
            dir="rtl"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => send(input)}
            disabled={!input.trim()}
            className="w-10 h-10 rounded-full bg-copper flex items-center justify-center hover:bg-copper-dark transition-colors shrink-0 disabled:opacity-40"
            aria-label="إرسال"
          >
            <Send size={16} className="text-white" style={{ transform: "scaleX(-1)" }} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg, delay }: { msg: Message; delay: number }) {
  const isUser = msg.sender === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className={cn("flex items-end gap-2.5", isUser ? "justify-start" : "justify-end")}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-espresso flex items-center justify-center shrink-0">
          <MessageCircle size={14} className="text-gold" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] md:max-w-md rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-copper text-white rounded-br-md shadow-[var(--shadow-sm)]"
            : "bg-card text-ink border border-line rounded-bl-md shadow-[var(--shadow-sm)]"
        )}
      >
        {msg.text}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-end gap-2.5 justify-end"
    >
      <div className="w-8 h-8 rounded-lg bg-espresso flex items-center justify-center shrink-0">
        <MessageCircle size={14} className="text-gold" />
      </div>
      <div className="bg-card border border-line rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5 shadow-[var(--shadow-sm)]">
        {[0, 0.15, 0.3].map((d) => (
          <motion.span
            key={d}
            className="w-2 h-2 rounded-full bg-ink-faint"
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: d, ease: "easeInOut" }}
          />
        ))}
      </div>
    </motion.div>
  );
}

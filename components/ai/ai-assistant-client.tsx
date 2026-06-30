"use client";

import { useCallback, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { BrainCircuit, Loader2, Send, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Props {
  roleLabel: string;
  roleFocus: string;
  examples: string[];
}

export function AIAssistantClient({ roleLabel, roleFocus, examples }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `你好，我会按“${roleLabel}”的事务侧重来协助你：${roleFocus}。`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const apiMessages = useMemo(
    () => messages.filter((message) => message.id !== "welcome").map(({ role, content }) => ({ role, content })),
    [messages],
  );

  const sendMessage = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || loading) return;

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };
      setMessages((current) => [...current, userMessage]);
      setInput("");
      setLoading(true);

      try {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...apiMessages, { role: "user", content }],
          }),
        });

        const result = (await response.json().catch(() => null)) as { answer?: string; error?: string } | null;
        if (!response.ok || !result?.answer) {
          throw new Error(result?.error ?? "AI 助手暂时不可用。");
        }

        const answer = result.answer;
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: answer,
          },
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 助手暂时不可用。";
        toast(message, "error");
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `暂时无法完成请求：${message}`,
          },
        ]);
      } finally {
        setLoading(false);
        textareaRef.current?.focus();
      }
    },
    [apiMessages, loading, toast],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="grid min-h-[680px] gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="surface-panel-elevated flex min-h-[680px] flex-col overflow-hidden rounded-lg">
        <div className="app-chrome border-b border-app-border px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-lg">
              <BrainCircuit className="h-5 w-5 text-app-accent-contrast" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-app-fg">RentOps Intelligence</h2>
              <p className="truncate text-xs text-app-muted">{roleLabel} · {roleFocus}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-app-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              DeepSeek 正在分析当前业务摘要
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="app-chrome border-t border-app-border p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="输入设备、订单、收益、风险或待办问题"
              className="focus-ring premium-control min-h-24 flex-1 resize-none rounded-lg border border-app-border-strong px-3 py-2 text-sm leading-6 text-app-fg placeholder:text-app-muted focus:border-app-accent"
            />
            <Button type="submit" variant="primary" size="lg" disabled={loading || !input.trim()} className="sm:h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送
            </Button>
          </div>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="surface-panel rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-app-accent" />
            <h3 className="text-sm font-semibold text-app-fg">角色上下文</h3>
          </div>
          <div className="mt-3 rounded-lg border border-app-border bg-app-surface/72 p-3">
            <p className="text-xs text-app-muted">当前身份</p>
            <p className="mt-1 text-sm font-semibold text-app-fg">{roleLabel}</p>
            <p className="mt-3 text-xs text-app-muted">事务侧重</p>
            <p className="mt-1 text-sm leading-6 text-app-muted-strong">{roleFocus}</p>
          </div>
        </section>

        <section className="surface-panel rounded-lg p-4">
          <h3 className="text-sm font-semibold text-app-fg">常用问题</h3>
          <div className="mt-3 space-y-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void sendMessage(example)}
                disabled={loading}
                className="focus-ring premium-control w-full rounded-lg border border-app-border px-3 py-2 text-left text-sm leading-5 text-app-muted-strong transition-[background-color,border-color,color,transform] hover:-translate-y-px hover:text-app-fg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {example}
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="brand-mark mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <BrainCircuit className="h-4 w-4 text-app-accent-contrast" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[min(760px,100%)] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
          isUser
            ? "bg-app-accent text-app-accent-contrast"
            : "surface-panel border border-app-border text-app-muted-strong",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownMessage content={message.content} />
        )}
      </div>
      {isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-surface-muted">
          <UserRound className="h-4 w-4 text-app-muted-strong" />
        </div>
      )}
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={blocks.length} className="my-3 overflow-x-auto rounded-lg border border-app-border bg-app-bg p-3 text-xs leading-5 text-app-fg">
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const className = level === 1
        ? "mt-4 text-lg font-semibold text-app-fg"
        : level === 2
          ? "mt-4 text-base font-semibold text-app-fg"
          : "mt-3 text-sm font-semibold text-app-fg";
      const headingContent = parseInline(heading[2]);
      if (level === 1) {
        blocks.push(<h3 key={blocks.length} className={className}>{headingContent}</h3>);
      } else if (level === 2) {
        blocks.push(<h4 key={blocks.length} className={className}>{headingContent}</h4>);
      } else {
        blocks.push(<h5 key={blocks.length} className={className}>{headingContent}</h5>);
      }
      index += 1;
      continue;
    }

    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const current = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(lines[index]);
        if (!current || /\d+\./.test(current[2]) !== ordered) break;
        items.push(<li key={items.length}>{parseInline(current[3])}</li>);
        index += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={blocks.length} className={cn("my-3 space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
          {items}
        </ListTag>,
      );
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trimStart().startsWith("```") &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={blocks.length} className="my-2 whitespace-pre-wrap leading-6">
        {parseInline(paragraphLines.join("\n"))}
      </p>,
    );
  }

  return <div className="max-w-none text-sm leading-6">{blocks}</div>;
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(<strong key={nodes.length} className="font-semibold text-app-fg">{match[2]}</strong>);
    } else if (match[3]) {
      nodes.push(
        <code key={nodes.length} className="rounded bg-app-bg px-1.5 py-0.5 font-mono text-xs text-app-fg">
          {match[3]}
        </code>,
      );
    } else if (match[4] && match[5]) {
      nodes.push(
        <a
          key={nodes.length}
          href={match[5]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-app-accent underline-offset-4 hover:underline"
        >
          {match[4]}
        </a>,
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

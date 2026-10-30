"use client";

import Link from "next/link";
import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components = (onNavigate?: () => void): Components => ({
  a: ({ href, children }) => {
    if (href?.startsWith("/")) {
      return (
        <Link href={href} onClick={onNavigate} className="font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary">
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
        {children}
      </a>
    );
  },
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground">{children}</ol>,
  h1: ({ children }) => <h3 className="mt-3 mb-1.5 text-[15px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1.5 text-[15px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children, className }) =>
    className ? (
      <code className={cn("block overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs", className)}>{children}</code>
    ) : (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>,
  table: ({ children }) => (
    <div className="scrollbar-thin my-2.5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-[12.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children, style }) => (
    <th style={style} className="px-2.5 py-1.5 text-left font-semibold whitespace-nowrap text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border-t border-border px-2.5 py-1.5 align-top whitespace-nowrap tabular">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-border" />,
});

export const Markdown = React.memo(function Markdown({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  return (
    <div className="text-[13.5px] break-words text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components(onNavigate)}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

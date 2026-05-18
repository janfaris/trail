import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-trail", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children, ...rest }) => (
            <a
              href={href}
              {...rest}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[#a7f300] underline-offset-4 hover:underline"
            >
              {children}
            </a>
          ),
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock) {
              return (
                <code className={cn("font-mono text-[0.85em]", className)} {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-zinc-800/80 text-zinc-100 font-mono text-[0.85em] px-1 py-0.5"
                {...rest}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

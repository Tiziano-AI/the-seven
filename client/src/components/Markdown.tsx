import { Suspense, lazy } from "react";
import { cn } from "@/lib/utils";

type MarkdownProps = Readonly<{
  markdown: string;
  className?: string;
}>;

const MarkdownRenderer = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ]);

  function Renderer(props: MarkdownProps) {
    return (
      <div className={cn("text-sm leading-relaxed text-foreground model-content", props.className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mt-6 mb-2 text-xl font-semibold text-foreground">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-5 mb-2 text-lg font-semibold text-foreground">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-4 mb-2 text-base font-semibold text-foreground">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="mt-2 mb-2 whitespace-pre-wrap">{children}</p>
            ),
            a: ({ children, href }) => (
              <a
                href={href}
                className="text-gold underline underline-offset-4 hover:text-gold-bright"
                target="_blank"
                rel="noreferrer"
              >
                {children}
              </a>
            ),
            ul: ({ children }) => (
              <ul className="mt-2 mb-2 list-disc pl-6">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mt-2 mb-2 list-decimal pl-6">{children}</ol>
            ),
            li: ({ children }) => <li className="mt-1">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="mt-3 mb-3 border-l-2 border-border pl-4 text-muted-foreground">
                {children}
              </blockquote>
            ),
            code: ({ children }) => (
              <code className="rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                {children}
              </code>
            ),
            pre: ({ children }) => (
              <pre className="mt-3 mb-3 overflow-auto rounded-md border border-border bg-muted p-3 text-xs text-foreground">
                {children}
              </pre>
            ),
            hr: () => <hr className="my-4 border-border" />,
            table: ({ children }) => (
              <div className="my-3 overflow-auto">
                <table className="w-full border-collapse border border-border">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="border border-border bg-muted px-2 py-1 text-left font-medium">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-border px-2 py-1">{children}</td>
            ),
          }}
        >
          {props.markdown}
        </ReactMarkdown>
      </div>
    );
  }

  return { default: Renderer };
});

export function Markdown(props: MarkdownProps) {
  return (
    <Suspense
      fallback={
        <div className={cn("text-sm leading-relaxed text-foreground model-content", props.className)}>
          <p className="whitespace-pre-wrap">{props.markdown}</p>
        </div>
      }
    >
      <MarkdownRenderer {...props} />
    </Suspense>
  );
}

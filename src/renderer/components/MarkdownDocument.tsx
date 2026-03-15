import type { ReactElement } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  className?: string;
};

export function MarkdownDocument({ content, className = "skills-markdown-body" }: Props): ReactElement {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          pre: ({ node: _node, ...props }) => <pre {...props} className="skills-markdown-pre" />
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

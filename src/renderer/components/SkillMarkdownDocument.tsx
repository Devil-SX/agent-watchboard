import type { ReactElement } from "react";

import { MarkdownDocument } from "@renderer/components/MarkdownDocument";

type Props = {
  content: string;
};

export function SkillMarkdownDocument({ content }: Props): ReactElement {
  return <MarkdownDocument content={content} />;
}

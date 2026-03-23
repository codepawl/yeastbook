import DOMPurify from "dompurify";
import { useMemo } from "react";

interface Props {
  html: string;
}

export function HtmlOutput({ html }: Props) {
  // Security: DOMPurify.sanitize() strips all dangerous tags/attributes before rendering.
  // This is safe to use with dangerouslySetInnerHTML because the content is sanitized.
  const sanitized = useMemo(() => DOMPurify.sanitize(html), [html]);

  return (
    <div
      className="html-output"
      dangerouslySetInnerHTML={{ __html: sanitized }} // eslint-disable-line react/no-danger
    />
  );
}

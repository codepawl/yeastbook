import { useRef, useEffect } from "react";
import katex from "katex";

interface Props {
  latex: string;
  displayMode?: boolean;
}

export function MathOutput({ latex, displayMode = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(latex, ref.current, {
        displayMode,
        throwOnError: false,
        output: "htmlAndMathml",
      });
    } catch {
      if (ref.current) ref.current.textContent = latex;
    }
  }, [latex, displayMode]);

  return <div ref={ref} className="math-output" />;
}

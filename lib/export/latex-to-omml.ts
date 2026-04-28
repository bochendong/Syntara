import { renderMathToOmml } from '@/lib/math-engine/omml';

/**
 * Convert a LaTeX string to OMML (Office Math Markup Language) XML.
 *
 * Kept as the export-facing compatibility wrapper. New code should use
 * `renderMathToOmml` from `lib/math-engine/omml`.
 */
export function latexToOmml(latex: string, fontSize?: number): string | null {
  return renderMathToOmml(latex, fontSize);
}

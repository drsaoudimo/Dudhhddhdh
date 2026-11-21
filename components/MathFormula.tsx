import React, { useMemo } from 'react';
import katex from 'katex';

interface MathFormulaProps {
  tex: string;
  display?: boolean;
  className?: string;
}

export const MathFormula: React.FC<MathFormulaProps> = ({ tex, display = false, className = '' }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false
      });
    } catch {
      return tex;
    }
  }, [tex, display]);

  if (display) {
    return (
      <div
        dir="ltr"
        className={`katex-ltr overflow-x-auto py-1 text-center text-[#1C1917] ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      dir="ltr"
      className={`katex-ltr inline-block align-middle text-[#1C1917] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default MathFormula;

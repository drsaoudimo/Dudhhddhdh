import React from 'react';

interface MatrixVisualizerProps {
  matrix: number[][];
  primes: number[];
}

const MatrixVisualizer: React.FC<MatrixVisualizerProps> = ({ matrix, primes }) => {
  if (!matrix || matrix.length === 0) return null;

  // Truncate for display if too large
  const displayRows = matrix.slice(0, 20);
  const displayCols = primes.slice(0, 24);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest italic">Factor Base Exponent Vectors (Mod 2)</span>
        <span className="text-[10px] text-indigo-400 font-mono font-bold tracking-tighter">Relations found: {matrix.length}</span>
      </div>
      <div className="overflow-x-auto border border-slate-800 rounded-xl bg-black/20">
        <table className="min-w-full text-[10px] font-mono border-collapse">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-slate-500">
              <th className="p-3 border-r border-slate-800 sticky left-0 bg-slate-900 z-10 text-right font-bold uppercase tracking-widest">Base</th>
              {displayCols.map((p, i) => (
                <th key={i} className="p-3 border-r border-slate-800 text-center font-bold text-indigo-300 bg-slate-900/50">{p}</th>
              ))}
              {primes.length > displayCols.length && <th className="p-3 border-r border-slate-800 text-center">...</th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-indigo-500/5 transition-colors border-b border-slate-800/30 last:border-0">
                <td className="p-3 border-r border-slate-800 text-indigo-400/60 font-bold sticky left-0 bg-indigo-950/10 z-10 text-right backdrop-blur-sm">
                  r{rIdx + 1}
                </td>
                {row.slice(0, displayCols.length).map((val, cIdx) => (
                  <td 
                    key={cIdx} 
                    className={`p-3 border-r border-slate-800/30 text-center transition-all ${
                      val === 1 
                      ? 'bg-emerald-500/10 text-emerald-400 font-black' 
                      : 'text-slate-800'
                    }`}
                  >
                    {val}
                  </td>
                ))}
                {primes.length > displayCols.length && (
                  <td className="p-3 border-r border-slate-800/30 text-slate-800 text-center opacity-20">·</td>
                )}
              </tr>
            ))}
            {matrix.length > displayRows.length && (
              <tr>
                <td colSpan={displayCols.length + 2} className="p-4 text-slate-600 italic text-center bg-black/40 text-[9px] font-bold uppercase tracking-[0.3em]">
                  [ Sieve Subspace Truncated for Viewport ]
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MatrixVisualizer;
import React, { useEffect, useRef } from 'react';

interface TerminalLogProps {
  logs: string[];
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div
      dir="ltr"
      className="bg-white border border-[#E2DDD2] rounded-xl p-4 h-full overflow-y-auto font-mono text-xs leading-relaxed text-[#1C1917]"
    >
      <div className="text-[11px] text-[#57534E] border-b border-[#EAE5DA] pb-2 mb-2.5 flex items-center justify-between">
        <span className="font-bold text-[#1E3A8A]">Execution Log · سجل التنفيذ الرياضي</span>
        <span className="tabular-nums">{logs.length} entries</span>
      </div>
      <div className="space-y-1.5">
        {logs.map((log, i) => {
          const isSuccess = log.includes('✅') || log.includes('Success') || log.includes('Verification (Product == N): true');
          const isError = log.includes('❌') || log.includes('Error');
          const isHeader = log.startsWith('>>') || log.includes('⚡');
          return (
            <div
              key={i}
              className={`break-words ${
                isSuccess
                  ? 'text-[#14532D] font-semibold'
                  : isError
                  ? 'text-[#9A3412] font-semibold'
                  : isHeader
                  ? 'text-[#1E3A8A]'
                  : 'text-[#57534E]'
              }`}
            >
              <span className="text-[#A89F8D] mr-2">[{String(i + 1).padStart(2, '0')}]</span>
              {log}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default TerminalLog;
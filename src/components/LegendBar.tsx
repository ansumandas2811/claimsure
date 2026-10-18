import React from 'react';

export const LegendBar: React.FC = () => {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Readiness Status:
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
          <i className="fa-solid fa-shield-halved text-red-600"></i> Blocked (High Risk)
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
          <i className="fa-solid fa-clock text-amber-600"></i> Needs Review
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
          <i className="fa-solid fa-circle-check text-emerald-600"></i> Ready
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
          <i className="fa-solid fa-circle-minus text-slate-400"></i> Not Reviewed
        </span>
      </div>

      <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-200 sm:pl-3 pt-1 sm:pt-0">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Action:
        </span>
        <span className="inline-flex items-center gap-1 text-slate-700 font-semibold text-[11px]">
          <i className="fa-solid fa-stethoscope text-indigo-600"></i> Doctor Note
        </span>
        <span className="inline-flex items-center gap-1 text-slate-700 font-semibold text-[11px]">
          <i className="fa-solid fa-file-invoice-dollar text-[#0B7A70]"></i> Billing Fix
        </span>
      </div>
    </div>
  );
};

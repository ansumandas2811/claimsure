import React, { useState } from 'react';
import { Search, ChevronRight, AlertCircle, Clock, CheckCircle2, AlertOctagon, Filter } from 'lucide-react';
import { EncounterSummary, ReadinessGate } from '../types.ts';

interface EncounterTableProps {
  encounters: EncounterSummary[];
  onSelectEncounter: (id: string) => void;
  isLoading: boolean;
}

export const EncounterTable: React.FC<EncounterTableProps> = ({
  encounters,
  onSelectEncounter,
  isLoading,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | ReadinessGate>('all');

  const filtered = encounters.filter(enc => {
    const matchesFilter = filter === 'all' || enc.gate === filter;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      enc.patientName.toLowerCase().includes(q) ||
      enc.id.toLowerCase().includes(q) ||
      enc.diagnosis.toLowerCase().includes(q) ||
      enc.payerPlan.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const getGateBadge = (gate: ReadinessGate) => {
    switch (gate) {
      case 'Not reviewed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            Not reviewed
          </span>
        );
      case 'Blocked':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-red-50 text-red-700 border border-red-200">
            <AlertOctagon className="w-3.5 h-3.5" />
            Blocked
          </span>
        );
      case 'Needs review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5" />
            Needs review
          </span>
        );
      case 'Ready':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ready
          </span>
        );
    }
  };

  const countByGate = (g: ReadinessGate) => encounters.filter(e => e.gate === g).length;

  return (
    <div className="space-y-4">
      {/* Top Controls: Search + Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient name, MRN, diagnosis, encounter ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#0B7A70] focus:bg-white transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Encounters ({encounters.length})
          </button>
          <button
            onClick={() => setFilter('Not reviewed')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'Not reviewed'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            Not Reviewed ({countByGate('Not reviewed')})
          </button>
          <button
            onClick={() => setFilter('Blocked')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'Blocked'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-red-700 hover:bg-red-50'
            }`}
          >
            Blocked ({countByGate('Blocked')})
          </button>
          <button
            onClick={() => setFilter('Needs review')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'Needs review'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:bg-amber-50'
            }`}
          >
            Needs Review ({countByGate('Needs review')})
          </button>
          <button
            onClick={() => setFilter('Ready')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              filter === 'Ready'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            Ready ({countByGate('Ready')})
          </button>
        </div>
      </div>

      {/* High-Density Worklist Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Patient & Encounter</th>
                <th className="py-3 px-4">Payer / TPA Plan</th>
                <th className="py-3 px-4">Primary Diagnosis</th>
                <th className="py-3 px-4 text-right">Total Charges</th>
                <th className="py-3 px-4 text-center">Audit Tasks</th>
                <th className="py-3 px-4 text-center">Readiness Gate</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#0B7A70] border-t-transparent rounded-full animate-spin" />
                      <span>Loading inpatient encounters...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No encounters match your search or filter.
                  </td>
                </tr>
              ) : (
                filtered.map(enc => (
                  <tr
                    key={enc.id}
                    onClick={() => onSelectEncounter(enc.id)}
                    className="hover:bg-slate-50/70 cursor-pointer transition-colors group"
                  >
                    {/* Patient & Encounter */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-[#0B7A70] transition-colors">
                        {enc.patientName}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span className="font-mono text-slate-600">{enc.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{enc.gender}</span>
                        {enc.birthDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Born {enc.birthDate}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Payer / TPA Plan */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="text-slate-800 font-medium truncate">{enc.payerPlan}</div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{enc.payorDisplay}</div>
                    </td>

                    {/* Primary Diagnosis */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="text-slate-800 font-medium truncate">{enc.diagnosis}</div>
                      {enc.diagnosisCode && (
                        <div className="text-xs font-mono text-slate-500 mt-0.5">
                          ICD-10: {enc.diagnosisCode}
                        </div>
                      )}
                    </td>

                    {/* Total Charges in INR */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-mono font-semibold text-slate-900 tabular-nums">
                        ₹{enc.totalInr.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px] text-slate-400 font-sans mt-0.5">INR (TPA Billed)</div>
                    </td>

                    {/* Audit Tasks */}
                    <td className="py-3.5 px-4 text-center">
                      {enc.tasksCount.open > 0 ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          <span className="font-bold">{enc.tasksCount.open}</span>
                          <span className="text-slate-500">open</span>
                          {enc.tasksCount.high > 0 && (
                            <span className="ml-1 text-red-600 font-semibold font-mono">
                              ({enc.tasksCount.high} high)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">None</span>
                      )}
                    </td>

                    {/* Readiness Gate */}
                    <td className="py-3.5 px-4 text-center">
                      {getGateBadge(enc.gate)}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectEncounter(enc.id);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#0B7A70] hover:text-white hover:bg-[#0B7A70] border border-[#0B7A70]/30 hover:border-[#0B7A70] rounded-lg transition-all"
                      >
                        <span>Review</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

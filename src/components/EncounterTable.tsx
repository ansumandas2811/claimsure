import React, { useState } from 'react';
import { EncounterSummary, ReadinessGate } from '../types.ts';
import { HoverScrollText } from './HoverScrollText.tsx';

interface EncounterTableProps {
  encounters: EncounterSummary[];
  onSelectEncounter: (id: string) => void;
  isLoading: boolean;
  initialFilter?: ReadinessGate | 'all';
  onRefresh?: () => void;
}

export const EncounterTable: React.FC<EncounterTableProps> = ({
  encounters,
  onSelectEncounter,
  isLoading,
  initialFilter = 'all',
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | ReadinessGate>(initialFilter);
  const [expandedEncounterId, setExpandedEncounterId] = useState<string | null>(null);
  const [isBatchAuditing, setIsBatchAuditing] = useState(false);

  const handleBatchAudit = async () => {
    setIsBatchAuditing(true);
    try {
      const res = await fetch('/api/review-all', { method: 'POST' });
      if (res.ok) {
        onRefresh?.();
      }
    } catch (err) {
      console.error('Batch audit error:', err);
    } finally {
      setIsBatchAuditing(false);
    }
  };

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
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap"
            title="Readiness review not yet executed"
          >
            <i className="fa-solid fa-circle-minus text-slate-500"></i>
            <span>Not reviewed</span>
          </span>
        );
      case 'Blocked':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-red-50 text-red-700 border border-red-200 whitespace-nowrap"
            title="High-severity clinical or policy block. Cannot export claim."
          >
            <i className="fa-solid fa-shield-halved text-red-600"></i>
            <span>Blocked</span>
          </span>
        );
      case 'Needs review':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
            title="Medium-severity sublimit or duplicate charge requiring review."
          >
            <i className="fa-solid fa-clock text-amber-600"></i>
            <span>Needs review</span>
          </span>
        );
      case 'Ready':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap"
            title="All rules verified. Ready for institutional submission."
          >
            <i className="fa-solid fa-circle-check text-emerald-600"></i>
            <span>Ready</span>
          </span>
        );
    }
  };

  const getGenderIcon = (gender: string) => {
    const isFemale = gender?.toLowerCase() === 'female';
    return isFemale ? (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-pink-50 text-pink-500 border border-pink-200 shrink-0"
        title="Female"
      >
        <i className="fa-solid fa-person-dress text-xs"></i>
      </span>
    ) : (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 shrink-0"
        title="Male"
      >
        <i className="fa-solid fa-person text-xs"></i>
      </span>
    );
  };

  const countByGate = (g: ReadinessGate) => encounters.filter(e => e.gate === g).length;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedEncounterId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Search & Segmented Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <i className="fa-solid fa-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-xs"></i>
          <input
            type="text"
            placeholder="Search patient, MRN, diagnosis, encounter ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-[#0B7A70] focus:bg-white transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({encounters.length})
          </button>
          <button
            onClick={() => setFilter('Blocked')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'Blocked'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-red-700 hover:bg-red-50'
            }`}
          >
            <i className="fa-solid fa-shield-halved text-[10px]"></i>
            <span>Blocked ({countByGate('Blocked')})</span>
          </button>
          <button
            onClick={() => setFilter('Needs review')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'Needs review'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-800 hover:bg-amber-50'
            }`}
          >
            <i className="fa-solid fa-clock text-[10px]"></i>
            <span>Review ({countByGate('Needs review')})</span>
          </button>
          <button
            onClick={() => setFilter('Ready')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'Ready'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <i className="fa-solid fa-circle-check text-[10px]"></i>
            <span>Ready ({countByGate('Ready')})</span>
          </button>
          <button
            onClick={() => setFilter('Not reviewed')}
            className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              filter === 'Not reviewed'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            <i className="fa-solid fa-circle-minus text-[10px]"></i>
            <span>Unreviewed ({countByGate('Not reviewed')})</span>
          </button>
        </div>

        {/* Batch Action */}
        <button
          onClick={handleBatchAudit}
          disabled={isBatchAuditing}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg shadow-xs transition-all whitespace-nowrap cursor-pointer disabled:opacity-50 shrink-0"
          title="Audit all encounters against policy rules"
        >
          <i className={`fa-solid ${isBatchAuditing ? 'fa-arrows-rotate animate-spin' : 'fa-bolt'}`}></i>
          <span>{isBatchAuditing ? 'Auditing All...' : 'Audit All'}</span>
        </button>
      </div>

      {/* Main Encounters Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                <th className="py-3 px-3 w-8"></th>
                <th className="py-3 px-3">Patient & ID</th>
                <th className="py-3 px-3">Payer / Plan</th>
                <th className="py-3 px-3">Primary Diagnosis</th>
                <th className="py-3 px-3 text-right">Billed (INR ₹)</th>
                <th className="py-3 px-3 text-center">Audit Tasks</th>
                <th className="py-3 px-3 text-center">Readiness Gate</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-[#0B7A70] border-t-transparent rounded-full animate-spin" />
                      <span>Loading inpatient claim encounters...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <i className="fa-solid fa-folder-open text-2xl text-slate-300 block mb-2"></i>
                    <span>No encounters match your search query or filter.</span>
                  </td>
                </tr>
              ) : (
                filtered.map(enc => {
                  const isExpanded = expandedEncounterId === enc.id;
                  return (
                    <React.Fragment key={enc.id}>
                      <tr
                        onClick={() => onSelectEncounter(enc.id)}
                        className={`hover:bg-slate-50 cursor-pointer transition-colors group ${
                          isExpanded ? 'bg-slate-50/80' : ''
                        }`}
                      >
                        {/* Expand Toggle */}
                        <td className="py-3 px-3 text-center" onClick={e => toggleExpand(enc.id, e)}>
                          <button
                            type="button"
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors"
                            title={isExpanded ? 'Collapse row details' : 'Expand row details'}
                          >
                            <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'} text-[10px]`}></i>
                          </button>
                        </td>

                        {/* Patient & Gender (Single Line, Blue/Pink icon) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getGenderIcon(enc.gender)}
                            <span className="font-bold text-slate-900 group-hover:text-[#0B7A70] transition-colors">
                              {enc.patientName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 font-medium">
                              ({enc.id})
                            </span>
                          </div>
                        </td>

                        {/* Payer / Plan (Hover Scroll Text) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <HoverScrollText
                            text={enc.payerPlan}
                            maxWidthClass="max-w-[200px]"
                            className="text-slate-800 font-medium"
                          />
                        </td>

                        {/* Primary Diagnosis (Hover Scroll Text) */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {enc.diagnosisCode && (
                              <span className="font-mono text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {enc.diagnosisCode}
                              </span>
                            )}
                            <HoverScrollText
                              text={enc.diagnosis}
                              maxWidthClass="max-w-[240px]"
                              className="text-slate-800"
                            />
                          </div>
                        </td>

                        {/* Total Charges in INR */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            ₹{enc.totalInr.toLocaleString('en-IN')}
                          </span>
                        </td>

                        {/* Audit Tasks */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {enc.tasksCount.open > 0 ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              <span>{enc.tasksCount.open} open</span>
                              {enc.tasksCount.high > 0 && (
                                <span className="text-red-600 font-bold ml-1 font-mono">
                                  ({enc.tasksCount.high} high)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">0 open</span>
                          )}
                        </td>

                        {/* Readiness Gate */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {getGateBadge(enc.gate)}
                        </td>

                        {/* Review Action */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onSelectEncounter(enc.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B7A70] hover:text-white hover:bg-[#0B7A70] border border-[#0B7A70]/30 hover:border-[#0B7A70] rounded-lg transition-all shadow-xs"
                          >
                            <span>Audit Desk</span>
                            <i className="fa-solid fa-arrow-right text-[10px]"></i>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Accordion Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-y border-slate-200/80">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* Clinical Context */}
                              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
                                  Encounter Details
                                </span>
                                <div className="text-slate-600">
                                  <strong>Admitted:</strong>{' '}
                                  {enc.period?.start ? new Date(enc.period.start).toLocaleDateString('en-IN') : 'N/A'}{' '}
                                  · <strong>Discharged:</strong>{' '}
                                  {enc.period?.end ? new Date(enc.period.end).toLocaleDateString('en-IN') : 'N/A'}
                                </div>
                                <div className="text-slate-600">
                                  <strong>Payor Agency:</strong> {enc.payorDisplay}
                                </div>
                                <div className="text-slate-600">
                                  <strong>Diagnosis:</strong> {enc.diagnosis} ({enc.diagnosisCode || 'Uncoded'})
                                </div>
                              </div>

                              {/* Billing & Sub-limit summary */}
                              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1.5">
                                <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
                                  Claim Tariff Overview
                                </span>
                                <div className="text-slate-600 flex justify-between">
                                  <span>Total Billed Amount:</span>
                                  <span className="font-mono font-bold text-slate-900">₹{enc.totalInr.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="text-slate-600 flex justify-between">
                                  <span>Navjeevan Room Sub-Limit:</span>
                                  <span className="font-mono text-slate-700">₹5,000 / day</span>
                                </div>
                                <div className="text-slate-600 flex justify-between">
                                  <span>ICU Standard Sub-Limit:</span>
                                  <span className="font-mono text-slate-700">₹10,000 / day</span>
                                </div>
                              </div>

                              {/* Task Action Box */}
                              <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 flex flex-col justify-between">
                                <div>
                                  <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px] block">
                                    Pre-Submission Status
                                  </span>
                                  <p className="text-slate-600 text-[11px] mt-1 leading-snug">
                                    {enc.gate === 'Ready'
                                      ? 'Claim is completely compliant with TPA policy guidelines. Ready for export.'
                                      : enc.gate === 'Blocked'
                                      ? 'High-severity discrepancy must be resolved by doctor addendum or billing correction.'
                                      : enc.gate === 'Needs review'
                                      ? 'Requires review of tariff limits or duplicate item entries before final billing.'
                                      : 'Readiness review not yet executed. Run an audit to evaluate compliance against policy rules.'}
                                  </p>
                                </div>

                                <button
                                  onClick={() => onSelectEncounter(enc.id)}
                                  className="w-full py-1.5 px-3 bg-[#0B7A70] hover:bg-[#085a53] text-white font-bold rounded-md transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <i className="fa-solid fa-stethoscope text-xs"></i>
                                  <span>Open Comprehensive Review</span>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

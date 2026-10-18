import React from 'react';
import { EncounterSummary, ReadinessGate, UserRole } from '../types.ts';
import { HoverScrollText } from './HoverScrollText.tsx';

interface DashboardProps {
  encounters: EncounterSummary[];
  onSelectEncounter: (id: string) => void;
  onNavigateToWorklist: (filter?: ReadinessGate | 'all') => void;
  role: UserRole;
}

interface CheckMeta {
  title: string;
  clause: string;
  icon: string;
  impact: 'Blocked' | 'Review';
  defaultDesc: string;
}

const CHECK_METADATA: Record<string, CheckMeta> = {
  icu_justification: {
    title: 'ICU Justification',
    clause: 'Clause 2',
    icon: 'fa-bed-pulse',
    impact: 'Blocked',
    defaultDesc: 'ICU stay requires documented vitals instability.',
  },
  diagnosis_support: {
    title: 'Diagnosis Support',
    clause: 'Clause 3',
    icon: 'fa-heart-pulse',
    impact: 'Blocked',
    defaultDesc: 'Billed condition ruled out or not supported by lab reports.',
  },
  room_rent_sublimit: {
    title: 'Room Rent Sub-Limit',
    clause: 'Clause 1',
    icon: 'fa-hotel',
    impact: 'Review',
    defaultDesc: 'Daily rate exceeds ₹5,000/day policy cap.',
  },
  policy_exclusion: {
    title: 'Policy Exclusions',
    clause: 'Clause 4',
    icon: 'fa-ban',
    impact: 'Blocked',
    defaultDesc: 'Elective cosmetic surgery or excluded service non-payable.',
  },
  duplicate_charge: {
    title: 'Duplicate Charges',
    clause: 'Clause 5',
    icon: 'fa-clone',
    impact: 'Review',
    defaultDesc: 'Identical scan billed multiple times.',
  },
};

function formatCheckTitle(check: string): string {
  if (CHECK_METADATA[check]) return CHECK_METADATA[check].title;
  return check
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export const Dashboard: React.FC<DashboardProps> = ({
  encounters,
  onSelectEncounter,
  onNavigateToWorklist,
  role,
}) => {
  const totalEncounters = encounters.length;
  const totalInr = encounters.reduce((sum, e) => sum + e.totalInr, 0);

  const blockedList = encounters.filter(e => e.gate === 'Blocked');
  const needsReviewList = encounters.filter(e => e.gate === 'Needs review');
  const readyList = encounters.filter(e => e.gate === 'Ready');
  const notReviewedList = encounters.filter(e => e.gate === 'Not reviewed');

  const blockedInr = blockedList.reduce((sum, e) => sum + e.totalInr, 0);
  const needsReviewInr = needsReviewList.reduce((sum, e) => sum + e.totalInr, 0);
  const readyInr = readyList.reduce((sum, e) => sum + e.totalInr, 0);

  const totalOpenTasks = encounters.reduce((sum, e) => sum + e.tasksCount.open, 0);
  const denialExposurePrevented = blockedInr + Math.round(needsReviewInr * 0.4);

  // Compute Discrepancy Breakdown strictly from open Tasks created by actual review runs
  const checkGroupsMap = new Map<string, {
    check: string;
    encounterIds: Set<string>;
    severities: ('high' | 'medium' | 'low')[];
    descriptions: string[];
    taskCount: number;
  }>();

  encounters.forEach(enc => {
    (enc.openTasks || []).forEach(task => {
      const checkKey = task.check || 'unspecified_check';
      if (!checkGroupsMap.has(checkKey)) {
        checkGroupsMap.set(checkKey, {
          check: checkKey,
          encounterIds: new Set(),
          severities: [],
          descriptions: [],
          taskCount: 0,
        });
      }
      const grp = checkGroupsMap.get(checkKey)!;
      grp.encounterIds.add(enc.id);
      grp.severities.push(task.severity);
      if (task.description) grp.descriptions.push(task.description);
      grp.taskCount += 1;
    });
  });

  const discrepancyGroups = Array.from(checkGroupsMap.values()).map(grp => {
    const meta = CHECK_METADATA[grp.check];
    const hasHigh = grp.severities.includes('high');
    const impact: 'Blocked' | 'Review' = meta ? meta.impact : (hasHigh ? 'Blocked' : 'Review');
    const color = impact === 'Blocked'
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-amber-800 bg-amber-50 border-amber-200';
    const title = meta ? meta.title : formatCheckTitle(grp.check);
    const clause = meta ? meta.clause : 'Audit Check';
    const icon = meta ? meta.icon : 'fa-triangle-exclamation';
    const desc = grp.descriptions[0] || meta?.defaultDesc || 'Discrepancy flagged during claim audit.';
    const claimCount = grp.encounterIds.size;

    return {
      check: grp.check,
      title,
      clause,
      icon,
      color,
      impact,
      desc,
      claimCount,
      taskCount: grp.taskCount,
      encounterIds: Array.from(grp.encounterIds),
    };
  });

  const priorityClaims = [...blockedList, ...needsReviewList].slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Readiness Overview Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0B7A70]" />
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-display">
              Claim Readiness Overview
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Pre-submission audit & denial prevention for inpatient claims.
          </p>
        </div>

        <button
          onClick={() => onNavigateToWorklist('all')}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="fa-solid fa-list-check"></i>
          <span>View All Claims ({totalEncounters})</span>
        </button>
      </div>

      {/* Primary KPI Metric Cards (Clean, Solid, No Gradient) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Billed */}
        <div
          onClick={() => onNavigateToWorklist('all')}
          className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-[#0B7A70] cursor-pointer transition-all space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold text-[11px] text-slate-600">Total Billed</span>
            <i className="fa-solid fa-receipt text-slate-400 group-hover:text-[#0B7A70]"></i>
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            ₹{totalInr.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-between">
            <span>{totalEncounters} claims</span>
            <span className="text-[#0B7A70] font-semibold">{totalOpenTasks} open tasks</span>
          </div>
        </div>

        {/* Blocked Claims */}
        <div
          onClick={() => onNavigateToWorklist('Blocked')}
          className="bg-white p-4 rounded-xl border border-red-200 shadow-xs hover:border-red-500 cursor-pointer transition-all space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-xs text-red-700">
            <span className="font-bold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-shield-halved text-red-600"></i> Blocked
            </span>
            <span className="font-mono text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded">
              High Risk
            </span>
          </div>
          <div className="text-2xl font-bold text-red-700 font-mono tabular-nums">
            {blockedList.length} <span className="text-xs font-normal text-slate-500">claims</span>
          </div>
          <div className="text-[11px] text-slate-600 font-mono">
            ₹{blockedInr.toLocaleString('en-IN')} at risk
          </div>
        </div>

        {/* Needs Review */}
        <div
          onClick={() => onNavigateToWorklist('Needs review')}
          className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs hover:border-amber-500 cursor-pointer transition-all space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-xs text-amber-800">
            <span className="font-bold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-clock text-amber-600"></i> Needs Review
            </span>
            <span className="font-mono text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
              Sub-limits
            </span>
          </div>
          <div className="text-2xl font-bold text-amber-800 font-mono tabular-nums">
            {needsReviewList.length} <span className="text-xs font-normal text-slate-500">claims</span>
          </div>
          <div className="text-[11px] text-slate-600 font-mono">
            ₹{needsReviewInr.toLocaleString('en-IN')} tariff variance
          </div>
        </div>

        {/* Ready to Submit */}
        <div
          onClick={() => onNavigateToWorklist('Ready')}
          className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs hover:border-emerald-500 cursor-pointer transition-all space-y-1.5 group"
        >
          <div className="flex items-center justify-between text-xs text-emerald-800">
            <span className="font-bold text-[11px] flex items-center gap-1.5">
              <i className="fa-solid fa-circle-check text-emerald-600"></i> Ready to Submit
            </span>
            <span className="font-mono text-[10px] bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.5 rounded">
              Clean
            </span>
          </div>
          <div className="text-2xl font-bold text-emerald-800 font-mono tabular-nums">
            {readyList.length} <span className="text-xs font-normal text-slate-500">claims</span>
          </div>
          <div className="text-[11px] text-slate-600 font-mono">
            ₹{readyInr.toLocaleString('en-IN')} approved
          </div>
        </div>
      </div>

      {/* Readiness Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">Portfolio Status</span>
          <span className="text-slate-500">
            {denialExposurePrevented > 0 ? (
              <>
                Denial Protected:{' '}
                <strong className="text-[#0B7A70] font-mono">
                  ₹{denialExposurePrevented.toLocaleString('en-IN')}
                </strong>
              </>
            ) : notReviewedList.length === totalEncounters ? (
              <span className="text-slate-400">All claims awaiting audit</span>
            ) : (
              <span className="text-slate-400">₹0 denial risk</span>
            )}
          </span>
        </div>

        <div className="h-3 w-full bg-slate-100 rounded-md overflow-hidden flex">
          {blockedList.length > 0 && (
            <div
              style={{ width: `${(blockedList.length / totalEncounters) * 100}%` }}
              className="bg-red-600 h-full cursor-pointer"
              title={`Blocked: ${blockedList.length}`}
              onClick={() => onNavigateToWorklist('Blocked')}
            />
          )}
          {needsReviewList.length > 0 && (
            <div
              style={{ width: `${(needsReviewList.length / totalEncounters) * 100}%` }}
              className="bg-amber-500 h-full cursor-pointer"
              title={`Needs Review: ${needsReviewList.length}`}
              onClick={() => onNavigateToWorklist('Needs review')}
            />
          )}
          {readyList.length > 0 && (
            <div
              style={{ width: `${(readyList.length / totalEncounters) * 100}%` }}
              className="bg-emerald-600 h-full cursor-pointer"
              title={`Ready: ${readyList.length}`}
              onClick={() => onNavigateToWorklist('Ready')}
            />
          )}
          {notReviewedList.length > 0 && (
            <div
              style={{ width: `${(notReviewedList.length / totalEncounters) * 100}%` }}
              className="bg-slate-300 h-full cursor-pointer"
              title={`Not Reviewed: ${notReviewedList.length}`}
              onClick={() => onNavigateToWorklist('Not reviewed')}
            />
          )}
        </div>

        <div className="flex items-center gap-4 text-[11px] font-semibold pt-1 flex-wrap">
          <span className="text-red-700 flex items-center gap-1 cursor-pointer" onClick={() => onNavigateToWorklist('Blocked')}>
            <span className="w-2 h-2 rounded-xs bg-red-600" /> Blocked ({blockedList.length})
          </span>
          <span className="text-amber-700 flex items-center gap-1 cursor-pointer" onClick={() => onNavigateToWorklist('Needs review')}>
            <span className="w-2 h-2 rounded-xs bg-amber-500" /> Needs Review ({needsReviewList.length})
          </span>
          <span className="text-emerald-700 flex items-center gap-1 cursor-pointer" onClick={() => onNavigateToWorklist('Ready')}>
            <span className="w-2 h-2 rounded-xs bg-emerald-600" /> Ready ({readyList.length})
          </span>
          <span className="text-slate-500 flex items-center gap-1 cursor-pointer" onClick={() => onNavigateToWorklist('Not reviewed')}>
            <span className="w-2 h-2 rounded-xs bg-slate-300" /> Unreviewed ({notReviewedList.length})
          </span>
        </div>
      </div>

      {/* Two-Column Grid: Discrepancies & Priority Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Discrepancy Categories (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Discrepancy Breakdown
            </h3>
            <span className="text-[11px] text-slate-500">
              {discrepancyGroups.length > 0 ? `${discrepancyGroups.length} check category flagged` : 'Navjeevan Policy'}
            </span>
          </div>

          {discrepancyGroups.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <i className="fa-solid fa-clipboard-check text-base"></i>
              </div>
              <div className="text-xs font-bold text-slate-700">
                No findings yet. Run a review to see discrepancies.
              </div>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                Findings appear dynamically once claims are audited against clinical notes, charge codes, and TPA policy rules.
              </p>
              <button
                onClick={() => onNavigateToWorklist('all')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#0B7A70] hover:text-white hover:bg-[#0B7A70] border border-[#0B7A70]/30 hover:border-[#0B7A70] rounded-lg transition-all cursor-pointer shadow-xs mt-1"
              >
                <i className="fa-solid fa-list-check text-[11px]"></i>
                <span>Go to Claim Worklist</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {discrepancyGroups.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    if (item.encounterIds.length === 1) {
                      onSelectEncounter(item.encounterIds[0]);
                    } else {
                      onNavigateToWorklist(item.impact === 'Blocked' ? 'Blocked' : 'Needs review');
                    }
                  }}
                  className="p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors flex items-center justify-between gap-3 bg-slate-50 cursor-pointer group"
                  title={`Click to view ${item.claimCount} affected claim${item.claimCount !== 1 ? 's' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${item.color}`}>
                      <i className={`fa-solid ${item.icon} text-xs`}></i>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs group-hover:text-[#0B7A70] transition-colors">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">({item.clause})</span>
                      </div>
                      <span className="text-[11px] text-slate-500 block truncate">{item.desc}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        item.impact === 'Blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {item.claimCount} claim{item.claimCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Queue (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Priority Review Queue
            </h3>
            <span className="text-[11px] text-slate-500">
              Role: <strong className="capitalize text-slate-800">{role}</strong>
            </span>
          </div>

          {priorityClaims.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 space-y-2.5">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <i className="fa-solid fa-inbox text-base"></i>
              </div>
              <div className="text-xs font-bold text-slate-700">
                {notReviewedList.length === totalEncounters
                  ? 'No findings yet. Run a review to see discrepancies.'
                  : 'No priority claims in queue'}
              </div>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                {notReviewedList.length === totalEncounters
                  ? 'All encounters are awaiting review. Auditing claims will flag high-risk blockers and tariff sub-limits here.'
                  : 'All reviewed claims are clean and ready for submission.'}
              </p>
              {notReviewedList.length > 0 && (
                <button
                  onClick={() => onNavigateToWorklist('all')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-[#0B7A70] hover:text-white hover:bg-[#0B7A70] border border-[#0B7A70]/30 hover:border-[#0B7A70] rounded-lg transition-all cursor-pointer shadow-xs mt-1"
                >
                  <i className="fa-solid fa-stethoscope text-[11px]"></i>
                  <span>Open Worklist to Audit</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {priorityClaims.map(enc => (
                <div
                  key={enc.id}
                  onClick={() => onSelectEncounter(enc.id)}
                  className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer transition-colors space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-xs group-hover:text-[#0B7A70] transition-colors">
                        {enc.patientName}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{enc.id}</span>
                    </div>

                    {enc.gate === 'Blocked' ? (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                        Blocked
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        Review
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 flex items-center justify-between">
                    <HoverScrollText text={enc.diagnosis} maxWidthClass="max-w-[180px]" />
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      ₹{enc.totalInr.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => onNavigateToWorklist('all')}
            className="w-full py-2 text-center text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            Open Full Worklist
          </button>
        </div>
      </div>
    </div>
  );
};

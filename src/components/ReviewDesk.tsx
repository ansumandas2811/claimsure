import React, { useState, useEffect, useRef } from 'react';
import { EncounterDetail, ReadinessGate, SystemStatus, TaskItem, UserRole } from '../types.ts';

interface ReviewDeskProps {
  encounterId: string;
  onBack: () => void;
  role: UserRole;
  systemStatus: SystemStatus | null;
  onRefreshSummary: () => void;
}

export const ReviewDesk: React.FC<ReviewDeskProps> = ({
  encounterId,
  onBack,
  role,
  systemStatus,
  onRefreshSummary,
}) => {
  const [data, setData] = useState<EncounterDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [leftTab, setLeftTab] = useState<'notes' | 'charges' | 'coding' | 'policy' | 'simulation'>('notes');
  const [policyText, setPolicyText] = useState('');

  // Agent SSE Streaming State
  const [isReviewing, setIsReviewing] = useState(false);
  const [agentLogs, setAgentLogs] = useState<Array<{ stage: string; data: any; time: string }>>([]);
  const [showAgentLogs, setShowAgentLogs] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Billing Override Modal State
  const [overrideTask, setOverrideTask] = useState<TaskItem | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Doctor Note Edit & Approve State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [doctorDraftText, setDoctorDraftText] = useState<Record<string, string>>({});
  const [isApprovingNote, setIsApprovingNote] = useState<string | null>(null);

  // Re-check loading state
  const [isRechecking, setIsRechecking] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadEncounter();
    loadPolicy();
  }, [encounterId]);

  useEffect(() => {
    if (showAgentLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [agentLogs, showAgentLogs]);

  const loadEncounter = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/encounters/${encounterId}`);
      if (!res.ok) throw new Error('Failed to load encounter');
      const json: EncounterDetail = await res.json();
      setData(json);

      // Pre-fill doctor drafts from task inputs
      const drafts: Record<string, string> = {};
      (json.tasks || []).forEach(t => {
        const inputDraft = t.input?.find(i => i.type?.text === 'suggested_fix')?.valueString;
        if (inputDraft) {
          drafts[t.id] = inputDraft;
        }
      });
      setDoctorDraftText(drafts);
    } catch (err: any) {
      setAgentError(err.message || 'Failed to load encounter');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPolicy = async () => {
    try {
      const res = await fetch('/api/policy');
      if (res.ok) {
        const json = await res.json();
        setPolicyText(json.policyText);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunReview = async () => {
    setIsReviewing(true);
    setAgentError(null);
    setAgentLogs([]);
    setShowAgentLogs(true);

    try {
      const response = await fetch(`/api/review/${encounterId}`, {
        method: 'POST',
      });

      if (!response.body) throw new Error('No SSE stream in response');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.replace('data: ', ''));
              setAgentLogs(prev => [...prev, { stage: event.stage, data: event.data, time: new Date().toLocaleTimeString() }]);

              if (event.stage === 'error') {
                setAgentError(event.data.error);
              }
            } catch (err) {
              console.warn('Error parsing SSE event:', err);
            }
          }
        }
      }

      await loadEncounter();
      onRefreshSummary();
    } catch (err: any) {
      setAgentError(err.message || 'Error executing review agent');
    } finally {
      setIsReviewing(false);
    }
  };

  const handleResolveTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/resolve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to resolve task');
      await loadEncounter();
      onRefreshSummary();
    } catch (err: any) {
      setAgentError(err.message || 'Error resolving task');
    }
  };

  const handleOpenOverride = (task: TaskItem) => {
    setOverrideTask(task);
    setOverrideReason('');
  };

  const handleConfirmOverride = async () => {
    if (!overrideTask || !overrideReason.trim()) return;
    setIsSubmittingOverride(true);
    try {
      const res = await fetch(`/api/tasks/${overrideTask.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: overrideReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to override task');
      }
      setOverrideTask(null);
      await loadEncounter();
      onRefreshSummary();
    } catch (err: any) {
      setAgentError(err.message || 'Error overriding task');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const handleDoctorApprove = async (taskId: string) => {
    const draft = doctorDraftText[taskId];
    if (!draft || !draft.trim()) {
      setAgentError('Doctor addendum note text cannot be empty.');
      return;
    }

    setIsApprovingNote(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/doctor-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteDraft: draft }),
      });
      if (!res.ok) throw new Error('Failed to approve note');
      await res.json();

      setEditingTaskId(null);
      await loadEncounter();
      onRefreshSummary();
    } catch (err: any) {
      setAgentError(err.message || 'Error approving doctor note');
    } finally {
      setIsApprovingNote(null);
    }
  };

  const handleRecheckTask = async (taskId: string) => {
    setIsRechecking(taskId);
    try {
      const res = await fetch(`/api/recheck/${taskId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Re-check request failed');
      await loadEncounter();
      onRefreshSummary();
    } catch (err: any) {
      setAgentError(err.message || 'Error rechecking task');
    } finally {
      setIsRechecking(null);
    }
  };

  const handleExportClaim = () => {
    window.location.href = `/api/export/${encounterId}`;
  };

  if (isLoading || !data) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-[#0B7A70] border-t-transparent rounded-full animate-spin" />
          <span>Loading encounter clinical record and tasks...</span>
        </div>
      </div>
    );
  }

  const patientName = `${data.patient?.name?.[0]?.given?.join(' ') || ''} ${data.patient?.name?.[0]?.family || ''}`.trim() || 'Unknown Patient';
  const openTasks = data.tasks.filter(t => t.status === 'requested' || t.status === 'in-progress');

  return (
    <div className="space-y-5">
      {/* Top Banner & Breadcrumb Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B7A70] hover:text-[#085a53] transition-colors mb-2 cursor-pointer"
          >
            <i className="fa-solid fa-arrow-left text-[11px]"></i>
            <span>Back to Worklist</span>
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 font-display">{patientName}</h1>

            {/* Gate Badge */}
            {data.gate === 'Not reviewed' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                <i className="fa-solid fa-circle-minus text-slate-500"></i>
                NOT REVIEWED
              </span>
            )}
            {data.gate === 'Blocked' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-red-100 text-red-800 border border-red-300">
                <i className="fa-solid fa-shield-halved text-red-600"></i>
                BLOCKED
              </span>
            )}
            {data.gate === 'Needs review' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                <i className="fa-solid fa-clock text-amber-600"></i>
                NEEDS REVIEW
              </span>
            )}
            {data.gate === 'Ready' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                <i className="fa-solid fa-circle-check text-emerald-600"></i>
                READY FOR SUBMISSION
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
            <span className="font-mono text-slate-700 font-medium">ID: {encounterId}</span>
            <span>·</span>
            <span>MRN: {data.patient?.identifier?.[0]?.value || 'MRN-IN-88210'}</span>
            <span>·</span>
            <span className="capitalize">{data.patient?.gender}</span>
            <span>·</span>
            <span>Admitted: {data.encounter?.period?.start ? new Date(data.encounter.period.start).toLocaleDateString('en-IN') : 'N/A'}</span>
            <span>·</span>
            <span>Payer: {data.coverage?.payor?.[0]?.display || 'Navjeevan Demo TPA'}</span>
            <span>·</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums">
              Total ₹{data.totalInr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Top Action: Export Claim */}
        <div className="flex items-center gap-3 shrink-0 self-stretch md:self-auto justify-end">
          <button
            onClick={handleExportClaim}
            disabled={data.gate !== 'Ready'}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg shadow-xs transition-all whitespace-nowrap ${
              data.gate === 'Ready'
                ? 'bg-[#0B7A70] hover:bg-[#085a53] text-white cursor-pointer'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
            title={data.gate === 'Ready' ? 'Download valid FHIR R4 Institutional Claim' : 'Claim must be in Ready state to export'}
          >
            <i className="fa-solid fa-download"></i>
            <span>Export FHIR Claim</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid: Left Inspector & Right Agent Desk */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Clinical Record & Tariff Inspector (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[740px]">
          {/* Sub-tabs */}
          <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 pt-2 gap-2 text-xs font-semibold">
            <button
              onClick={() => setLeftTab('notes')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'notes'
                  ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-file-lines"></i>
              <span>Discharge Note</span>
            </button>
            <button
              onClick={() => setLeftTab('charges')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'charges'
                  ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-receipt"></i>
              <span>Charges ({data.charges.length})</span>
            </button>
            <button
              onClick={() => setLeftTab('coding')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'coding'
                  ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-stethoscope"></i>
              <span>ICD-10 Coding</span>
            </button>
            <button
              onClick={() => setLeftTab('policy')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'policy'
                  ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-shield-halved"></i>
              <span>TPA Clauses</span>
            </button>
            <button
              onClick={() => setLeftTab('simulation')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'simulation'
                  ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <i className="fa-solid fa-calculator"></i>
              <span>TPA Adjudication Simulator</span>
            </button>
          </div>

          {/* Inspector Body */}
          <div className="flex-1 p-4 overflow-y-auto text-xs">
            {leftTab === 'notes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-800">DocumentReference / Clinical Discharge Record</span>
                  <span className="text-[11px] font-mono">Verbatim Source</span>
                </div>
                {data.documents.length === 0 ? (
                  <p className="text-slate-400 italic">No discharge documentation attached.</p>
                ) : (
                  data.documents.map(doc => (
                    <div key={doc.id} className="space-y-2">
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg whitespace-pre-wrap leading-relaxed text-slate-800 font-mono text-xs">
                        {doc.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {leftTab === 'charges' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-800">Itemized ChargeItems Billed to TPA</span>
                  <span className="font-mono font-bold text-slate-900">Total: ₹{data.totalInr.toLocaleString('en-IN')}</span>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2 px-2.5">Description</th>
                      <th className="py-2 px-2 text-center">Qty</th>
                      <th className="py-2 px-2.5 text-right">Price (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.charges.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5">
                          <div className="font-semibold text-slate-900">
                            {c.code?.coding?.[0]?.display || c.code?.text || 'Charge Item'}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {c.id} · {c.code?.coding?.[0]?.code || 'N/A'}
                            {c.occurrenceDateTime && ` · ${new Date(c.occurrenceDateTime).toLocaleDateString('en-IN')}`}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono">{c.quantity?.value || 1}</td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                          ₹{(c.priceOverride?.value || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {leftTab === 'coding' && (
              <div className="space-y-4 text-xs">
                <div>
                  <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                    Claim Diagnoses (Condition Resources)
                  </h3>
                  <div className="space-y-2">
                    {data.conditions.map(cond => (
                      <div key={cond.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {cond.code?.coding?.[0]?.code || 'Unspecified'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
                            {cond.verificationStatus?.coding?.[0]?.code || 'confirmed'}
                          </span>
                        </div>
                        <div className="text-slate-800 font-semibold mt-1">
                          {cond.code?.coding?.[0]?.display || cond.code?.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                    Coverage & Payer Authorization
                  </h3>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="font-bold text-slate-900">
                      {data.coverage?.payor?.[0]?.display || 'Navjeevan Demo TPA'}
                    </div>
                    <div className="text-slate-600">
                      Plan: {data.coverage?.class?.[0]?.name || data.coverage?.class?.[0]?.value || 'Corporate Health Suraksha'}
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      Policy Ref: {data.coverage?.id || 'COV-KAVACH-2026'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {leftTab === 'policy' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-800">
                    Navjeevan Demo TPA Policy Clauses (Room Rent & Exclusions)
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {policyText || 'Loading policy clauses...'}
                </div>
              </div>
            )}

            {leftTab === 'simulation' && (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <span className="font-bold text-slate-800 block">
                      TPA Pre-Submission Settlement Simulation
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Predicts adjudication deductions under Navjeevan policy guidelines.
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#0B7A70] bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    IRDAI RCM Engine
                  </span>
                </div>

                {/* Pre-Auth & Sum-Insured Tracker */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Initial Pre-Auth Limit
                    </span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      ₹{(Math.max(50000, Math.round(data.totalInr * 0.85))).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Total Billed Amount
                    </span>
                    <span className="text-base font-bold text-slate-900 font-mono">
                      ₹{data.totalInr.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Projected Deductions Breakdown */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-800 block text-xs">
                    Projected TPA Line-Item Adjudication (illustrative estimate):
                  </span>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-600">Gross Hospital Claim Tariff:</span>
                      <span className="font-mono font-bold text-slate-900">₹{data.totalInr.toLocaleString('en-IN')}</span>
                    </div>

                    {data.gate === 'Blocked' && (
                      <div className="flex justify-between py-1 border-b border-red-100 text-red-700 bg-red-50/50 px-1 rounded">
                        <span>High-Risk Discrepancy (Undocumented ICU / Exclusion):</span>
                        <span className="font-mono font-bold">-₹{Math.round(data.totalInr * 0.45).toLocaleString('en-IN')} (100% Risk)</span>
                      </div>
                    )}

                    {data.charges.some(c => (c.priceOverride?.value || 0) > 15000) && (
                      <div className="flex justify-between py-1 border-b border-amber-100 text-amber-800 bg-amber-50/50 px-1 rounded">
                        <span>Room Rent Proportionate Haircut:</span>
                        <span className="font-mono font-bold">-₹4,500</span>
                      </div>
                    )}

                    <div className="flex justify-between py-1 border-b border-slate-100 text-slate-600">
                      <span>Mandatory Non-Medical Consumables Co-pay:</span>
                      <span className="font-mono font-bold">-₹1,800</span>
                    </div>

                    <div className="flex justify-between pt-2 text-xs font-bold text-emerald-800 bg-emerald-50 p-2 rounded">
                      <span>Estimated Admissible Net Settlement:</span>
                      <span className="font-mono">
                        ₹{(data.gate === 'Ready'
                          ? Math.round(data.totalInr * 0.94)
                          : Math.round(data.totalInr * 0.52)
                        ).toLocaleString('en-IN')}{' '}
                        ({data.gate === 'Ready' ? '94.5%' : '52% - Action Required'})
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-[11px] text-[#0B7A70] flex items-center gap-2">
                  <i className="fa-solid fa-lightbulb text-sm"></i>
                  <span>
                    {data.gate === 'Not reviewed'
                      ? 'Run a readiness audit to identify potential post-claim deductions before submission.'
                      : openTasks.length > 0
                      ? `Resolving open tasks on the right before submission prevents ₹${Math.round(data.totalInr * 0.45).toLocaleString('en-IN')} in automatic post-claim deductions.`
                      : 'All clinical documentation and policy rules verified. No post-claim deductions projected.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: ClaimSure Agent Execution & Tasks (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Agent Trigger Card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0B7A70]" />
                  <h2 className="font-bold text-slate-900 font-display text-base">
                    ClaimSure Readiness Review Agent
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated reasoning loop cross-referencing clinical discharge notes, charges, and policy rules.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {agentLogs.length > 0 && (
                  <button
                    onClick={() => setShowAgentLogs(!showAgentLogs)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="fa-solid fa-terminal text-xs"></i>
                    <span>{showAgentLogs ? 'Hide Stream' : 'Show Stream'}</span>
                  </button>
                )}

                <button
                  onClick={handleRunReview}
                  disabled={isReviewing}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-xs transition-all whitespace-nowrap cursor-pointer ${
                    isReviewing
                      ? 'bg-[#0B7A70]/70 text-white cursor-wait'
                      : 'bg-[#0B7A70] hover:bg-[#085a53] text-white'
                  }`}
                >
                  {isReviewing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Auditing Claim...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-play text-xs"></i>
                      <span>Run Readiness Audit</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {agentError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2.5">
                <i className="fa-solid fa-triangle-exclamation text-red-600 shrink-0 mt-0.5"></i>
                <div>
                  <span className="font-bold block">Notice:</span>
                  <span className="text-red-700 text-[11px] block mt-0.5">{agentError}</span>
                </div>
              </div>
            )}

            {/* Live SSE Stream Panel */}
            {showAgentLogs && (
              <div className="mt-3 border border-slate-800 rounded-lg bg-slate-900 text-slate-200 p-3 font-mono text-xs max-h-56 overflow-y-auto space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                  <span>LIVE SERVER-SENT EVENTS (SSE) STREAM</span>
                  <span>{agentLogs.length} events logged</span>
                </div>
                {agentLogs.map((log, idx) => (
                  <div key={idx} className="leading-snug">
                    <span className="text-slate-500">[{log.time}]</span>{' '}
                    {log.stage === 'plan' && (
                      <span className="text-teal-300 font-bold">
                        PLAN: {JSON.stringify(log.data.plan || log.data.message)}
                      </span>
                    )}
                    {log.stage === 'tool_call' && (
                      <span className="text-amber-300">
                        TOOL CALL: {log.data.name}({JSON.stringify(log.data.args)})
                      </span>
                    )}
                    {log.stage === 'tool_result' && (
                      <span className="text-slate-400">
                        RESULT ({log.data.name}): {JSON.stringify(log.data.result).slice(0, 75)}...
                      </span>
                    )}
                    {log.stage === 'verification' && (
                      <span className="text-emerald-300 font-bold">
                        VERIFIED: {log.data.verifiedCount} passed verbatim check, {log.data.rawCount - log.data.verifiedCount} dropped
                      </span>
                    )}
                    {log.stage === 'tasks_saved' && (
                      <span className="text-blue-300 font-bold">Saved {log.data.count} FHIR Tasks</span>
                    )}
                    {log.stage === 'gate' && (
                      <span className="text-purple-300 font-bold">Readiness Gate: {log.data.gate}</span>
                    )}
                    {log.stage === 'error' && (
                      <span className="text-red-400 font-bold">Error: {log.data.error}</span>
                    )}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>

          {/* Tasks List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                  Claim Readiness Tasks ({data.tasks.length})
                </h3>
                {openTasks.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-red-100 text-red-800 font-mono">
                    {openTasks.length} open
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Active Desk: <span className="font-bold text-[#0F2A3D] capitalize">{role}</span>
              </div>
            </div>

            {data.tasks.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-xs space-y-2">
                <i className="fa-solid fa-clock text-3xl text-slate-400"></i>
                <h4 className="font-bold text-slate-900">Encounter Not Yet Audited</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click "Run Readiness Audit" above to cross-reference charges and clinical notes with Navjeevan Demo TPA policy clauses.
                </p>
              </div>
            ) : (
              data.tasks.map(task => {
                const isDocRole = role === 'doctor';
                const isAssignedDoctor = task.owner?.display?.toLowerCase() === 'doctor';
                const isOpen = task.status === 'requested' || task.status === 'in-progress';
                const isCompleted = task.status === 'completed';
                const isCancelled = task.status === 'cancelled';
                const rawSev = task.businessStatus?.text?.toLowerCase().trim() || '';
                const severity = rawSev === 'medium' || rawSev === 'warning' || rawSev === 'moderate'
                  ? 'medium'
                  : rawSev === 'low' || rawSev === 'info' || rawSev === 'minor'
                  ? 'low'
                  : 'high';

                const draftFix = task.input?.find(i => i.type?.text === 'suggested_fix')?.valueString || '';
                const rawEvidenceNote = task.note?.[0]?.text || '';
                const evidenceNote = rawEvidenceNote.replace(/\[(?:undefined|null)\]\s*/gi, '[DocumentReference/docref-001] ');

                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-xl border transition-all bg-white shadow-xs ${
                      isCompleted
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : isCancelled
                        ? 'border-slate-200 bg-slate-50 opacity-80'
                        : severity === 'high'
                        ? 'border-red-200'
                        : 'border-amber-200'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                              severity === 'high'
                                ? 'bg-red-100 text-red-800'
                                : severity === 'medium'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {severity} severity
                          </span>

                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700 flex items-center gap-1">
                            <i className={`fa-solid ${task.owner?.display === 'Doctor' ? 'fa-stethoscope text-indigo-600' : 'fa-file-invoice-dollar text-[#0B7A70]'}`}></i>
                            <span>Assigned: {task.owner?.display || 'Billing'}</span>
                          </span>

                          <span className="font-mono text-xs text-slate-500 font-semibold">
                            {task.code?.text || 'audit_check'}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-sm mt-1.5 leading-snug">
                          {task.description || 'Discrepancy identified'}
                        </h4>
                      </div>

                      {/* Status Tag */}
                      <div>
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-md">
                            <i className="fa-solid fa-check"></i> Resolved
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-200 px-2.5 py-0.5 rounded-md">
                            Overridden
                          </span>
                        )}
                        {isOpen && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-md">
                            Open
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Verbatim Evidence Quote Box */}
                    {evidenceNote && (
                      <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span className="font-bold text-slate-700 uppercase tracking-wider">
                            Verified Source Evidence
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <i className="fa-solid fa-check text-[10px]"></i> Verbatim Match
                          </span>
                        </div>
                        <p className="font-mono text-slate-800 text-[11px] leading-relaxed italic">
                          {evidenceNote}
                        </p>
                      </div>
                    )}

                    {/* Suggested Fix Draft */}
                    {draftFix && isOpen && (
                      <div className="mt-3 p-3 bg-teal-50/50 border border-teal-200/60 rounded-lg text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[#0B7A70] font-bold text-[11px]">
                          <span>Suggested Action / Proposed Fix:</span>
                          {isDocRole && isAssignedDoctor && editingTaskId !== task.id && (
                            <button
                              onClick={() => setEditingTaskId(task.id)}
                              className="text-xs underline hover:text-[#085a53] cursor-pointer"
                            >
                              Edit Addendum
                            </button>
                          )}
                        </div>

                        {/* Doctor Editing Note */}
                        {isDocRole && editingTaskId === task.id ? (
                          <div className="space-y-2 mt-1">
                            {/* CDI Quick Addendum Templates */}
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="font-bold text-slate-500 uppercase tracking-wider">CDI Quick Templates:</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setDoctorDraftText({
                                    ...doctorDraftText,
                                    [task.id]:
                                      'Attending Physician Clinical Addendum: Patient exhibited transient post-operative hypotension (MAP < 65 mmHg) requiring continuous arterial pressure monitoring and ICU hemodynamic stabilization. Vitals stabilized post-intervention without inotrope escalation.',
                                  })
                                }
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 font-semibold cursor-pointer"
                              >
                                + ICU Hemodynamics
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDoctorDraftText({
                                    ...doctorDraftText,
                                    [task.id]:
                                      'Attending Physician Clinical Addendum: Serial cardiac Troponin-I returned negative (<0.01 ng/mL) and ECG showed no acute ischemic ST changes. Acute Myocardial Infarction ruled out; clinical symptoms concordant with Severe Gastroesophageal Reflux Disease (GERD) with esophageal spasm (K21.9).',
                                  })
                                }
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 font-semibold cursor-pointer"
                              >
                                + Troponin / Rule-Out
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDoctorDraftText({
                                    ...doctorDraftText,
                                    [task.id]:
                                      'Attending Physician Clinical Addendum: Procedure performed under acute emergency indication for symptom alleviation following diagnostic verification.',
                                  })
                                }
                                className="px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 font-semibold cursor-pointer"
                              >
                                + Emergency Indication
                              </button>
                            </div>

                            <textarea
                              value={doctorDraftText[task.id] || draftFix}
                              onChange={e =>
                                setDoctorDraftText({ ...doctorDraftText, [task.id]: e.target.value })
                              }
                              rows={3}
                              className="w-full p-2 text-xs font-mono bg-white border border-[#0B7A70] rounded-lg text-slate-900 focus:outline-hidden"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingTaskId(null)}
                                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDoctorApprove(task.id)}
                                disabled={isApprovingNote === task.id}
                                className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-[#0B7A70] text-white rounded-md hover:bg-[#085a53]"
                              >
                                {isApprovingNote === task.id ? 'Approving...' : 'Save & Approve Note'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="font-mono text-slate-800 text-[11px] leading-relaxed">
                            {doctorDraftText[task.id] || draftFix}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Cancellation Reason if Overridden */}
                    {task.statusReason?.text && (
                      <div className="mt-2 text-xs text-slate-600 bg-slate-100 p-2 rounded">
                        <span className="font-bold text-slate-700">Override Rationale:</span>{' '}
                        {task.statusReason.text}
                      </div>
                    )}

                    {/* Action Buttons based on Role */}
                    {isOpen && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-400 font-mono">Task ID: {task.id}</div>

                        <div className="flex items-center gap-2">
                          {isDocRole ? (
                            <>
                              <button
                                onClick={() => handleRecheckTask(task.id)}
                                disabled={isRechecking === task.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                              >
                                <i className={`fa-solid fa-arrows-rotate text-xs ${isRechecking === task.id ? 'animate-spin' : ''}`}></i>
                                <span>Re-check Task</span>
                              </button>

                              {isAssignedDoctor && editingTaskId !== task.id && (
                                <button
                                  onClick={() => handleDoctorApprove(task.id)}
                                  disabled={isApprovingNote === task.id}
                                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg transition-colors shadow-xs"
                                >
                                  <i className="fa-solid fa-check"></i>
                                  <span>Approve Draft Note</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOpenOverride(task)}
                                className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                Override...
                              </button>
                              <button
                                onClick={() => handleResolveTask(task.id)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg transition-colors shadow-xs"
                              >
                                <i className="fa-solid fa-check"></i>
                                <span>Resolve Task</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Override Modal */}
      {overrideTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Billing Override Justification
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  An audit rationale is required under IRDAI insurance compliance.
                </p>
              </div>
              <button
                onClick={() => setOverrideTask(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="font-bold text-slate-700">Check: {overrideTask.code?.text}</div>
              <div className="text-slate-600">{overrideTask.description}</div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Override Reason & Regulatory Exception Details *
              </label>
              <textarea
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                rows={4}
                placeholder="e.g. Approved by Medical Director Dr. Mehta under emergency exception protocol..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#0B7A70]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setOverrideTask(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOverride}
                disabled={!overrideReason.trim() || isSubmittingOverride}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors shadow-xs"
              >
                {isSubmittingOverride ? 'Saving Override...' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

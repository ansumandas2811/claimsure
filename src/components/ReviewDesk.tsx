import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  Stethoscope,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Download,
  FileText,
  DollarSign,
  Activity,
  FileCode,
  Check,
  X,
  Sparkles,
  Terminal,
  RotateCcw,
  UserCheck,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
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
  const [leftTab, setLeftTab] = useState<'notes' | 'charges' | 'coding' | 'policy'>('notes');
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
    if (!systemStatus?.geminiConfigured) {
      setAgentError(systemStatus?.geminiReason || 'Gemini not configured: run gcloud auth application-default login');
      return;
    }

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
      const json = await res.json();

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
    <div className="space-y-6">
      {/* Top Banner & Encounter Breadcrumb */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Worklist
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 font-display">{patientName}</h1>
            {/* Gate Badge */}
            {data.gate === 'Blocked' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-red-100 text-red-800 border border-red-300">
                <AlertOctagon className="w-3.5 h-3.5" />
                BLOCKED
              </span>
            )}
            {data.gate === 'Needs review' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                <Clock className="w-3.5 h-3.5" />
                NEEDS REVIEW
              </span>
            )}
            {data.gate === 'Ready' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                READY FOR SUBMISSION
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
            <span className="font-mono text-slate-700 font-medium">ID: {encounterId}</span>
            <span aria-hidden="true">·</span>
            <span>MRN: {data.patient?.identifier?.[0]?.value || 'MRN-IN-88210'}</span>
            <span aria-hidden="true">·</span>
            <span className="capitalize">{data.patient?.gender}</span>
            <span aria-hidden="true">·</span>
            <span>Admitted: {data.encounter?.period?.start ? new Date(data.encounter.period.start).toLocaleDateString('en-IN') : 'N/A'}</span>
            <span aria-hidden="true">·</span>
            <span>Payer: {data.coverage?.payor?.[0]?.display || 'Navjeevan Demo TPA'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold text-slate-800 tabular-nums">
              Total ₹{data.totalInr.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Top Actions: Export Claim */}
        <div className="flex items-center gap-3 shrink-0 self-stretch md:self-auto justify-end">
          <button
            onClick={handleExportClaim}
            disabled={data.gate !== 'Ready'}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg shadow-xs transition-all whitespace-nowrap ${
              data.gate === 'Ready'
                ? 'bg-[#0B7A70] hover:bg-[#085a53] text-white cursor-pointer'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
            title={data.gate === 'Ready' ? 'Download valid FHIR R4 Institutional Claim' : 'Claim must be in Ready state to export'}
          >
            <Download className="w-4 h-4" />
            <span>Export FHIR Claim</span>
          </button>
        </div>
      </div>

      {/* Main Split View: Left Clinical Inspector & Right Agent Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Record Inspector (5 of 12 cols) */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[750px]">
          {/* Tabs */}
          <div className="flex items-center border-b border-slate-200 bg-slate-50/70 px-3 pt-2 gap-2 text-xs font-medium">
            <button
              onClick={() => setLeftTab('notes')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'notes'
                  ? 'border-[#0B7A70] text-[#0B7A70] font-semibold bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Discharge Note
            </button>
            <button
              onClick={() => setLeftTab('charges')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'charges'
                  ? 'border-[#0B7A70] text-[#0B7A70] font-semibold bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Itemized Charges ({data.charges.length})
            </button>
            <button
              onClick={() => setLeftTab('coding')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'coding'
                  ? 'border-[#0B7A70] text-[#0B7A70] font-semibold bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Clinical Coding
            </button>
            <button
              onClick={() => setLeftTab('policy')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                leftTab === 'policy'
                  ? 'border-[#0B7A70] text-[#0B7A70] font-semibold bg-white rounded-t-md'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Policy Clauses
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 p-4 overflow-y-auto font-sans text-sm">
            {leftTab === 'notes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-100 pb-2">
                  <span className="font-semibold text-slate-700">DocumentReference / Clinical Discharge Summary</span>
                  <span>Verbatim Record</span>
                </div>
                {data.documents.length === 0 ? (
                  <p className="text-slate-400 italic">No discharge documentation attached.</p>
                ) : (
                  data.documents.map(doc => (
                    <div key={doc.id} className="space-y-2">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg whitespace-pre-wrap leading-relaxed text-slate-800 font-mono text-xs">
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
                  <span className="font-semibold text-slate-700">Itemized ChargeItems Billed to TPA</span>
                  <span className="font-mono tabular-nums">Total: ₹{data.totalInr.toLocaleString('en-IN')}</span>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-2.5">Code / Service Description</th>
                      <th className="py-2 px-2 text-center">Qty</th>
                      <th className="py-2 px-2.5 text-right">Price (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.charges.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2.5">
                          <div className="font-medium text-slate-900">
                            {c.code?.coding?.[0]?.display || c.code?.text || 'Charge Item'}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {c.id} · {c.code?.coding?.[0]?.code || 'N/A'}
                            {c.occurrenceDateTime && ` · ${new Date(c.occurrenceDateTime).toLocaleDateString('en-IN')}`}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center font-mono">
                          {c.quantity?.value || 1}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
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
                  <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                    Claim Diagnosis (Condition)
                  </h3>
                  <div className="space-y-2">
                    {data.conditions.map(cond => (
                      <div key={cond.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-800 text-sm">
                            {cond.code?.coding?.[0]?.code || 'Unspecified'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700">
                            {cond.verificationStatus?.coding?.[0]?.code || 'confirmed'}
                          </span>
                        </div>
                        <div className="text-slate-700 font-medium mt-1">
                          {cond.code?.coding?.[0]?.display || cond.code?.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-slate-800 uppercase tracking-wider text-[11px] mb-2">
                    Coverage & Payer Policy
                  </h3>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="font-medium text-slate-900">
                      {data.coverage?.payor?.[0]?.display || 'Navjeevan Demo TPA / Kavach Demo General Insurance'}
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
                  <span className="font-semibold text-slate-800">
                    Navjeevan Demo TPA Policy Reference (Room Rent & Exclusions)
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {policyText || 'Loading policy clauses...'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Claim Readiness Agent Console (6 of 12 cols) */}
        <div className="lg:col-span-6 space-y-4">
          {/* Agent Trigger Card */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#0B7A70]" />
                  <h2 className="font-bold text-slate-900 font-display text-base">
                    ClaimSure Autonomous Review Agent
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  12-turn Gemini loop evaluating clinical notes, policy limits, ICU necessity, and billing accuracy.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {agentLogs.length > 0 && (
                  <button
                    onClick={() => setShowAgentLogs(!showAgentLogs)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>{showAgentLogs ? 'Hide stream' : 'Show stream'}</span>
                  </button>
                )}

                <button
                  onClick={handleRunReview}
                  disabled={isReviewing || !systemStatus?.geminiConfigured}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg shadow-xs transition-all whitespace-nowrap ${
                    !systemStatus?.geminiConfigured
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                      : isReviewing
                      ? 'bg-[#0B7A70]/70 text-white cursor-wait'
                      : 'bg-[#0B7A70] hover:bg-[#085a53] text-white cursor-pointer'
                  }`}
                >
                  {isReviewing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Auditing Claim...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Run Readiness Review</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error or Missing ADC Banner */}
            {!systemStatus?.geminiConfigured && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Gemini not configured: run gcloud auth application-default login</span>
                  <span className="text-amber-800 text-[11px] block mt-0.5">
                    Vertex AI credentials are not active in this environment. Worklist, FHIR browsing, task overrides, doctor note approvals, and claim export remain fully functional.
                  </span>
                </div>
              </div>
            )}

            {agentError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-900 text-xs flex items-start gap-2.5">
                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Agent execution error:</span>
                  <span className="text-red-700 text-[11px] block mt-0.5">{agentError}</span>
                </div>
              </div>
            )}

            {/* Live SSE Stream Panel */}
            {showAgentLogs && (
              <div className="mt-3 border border-slate-200 rounded-lg bg-slate-900 text-slate-200 p-3 font-mono text-xs max-h-56 overflow-y-auto space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                  <span>LIVE SERVER-SENT EVENTS (SSE) STREAM</span>
                  <span>{agentLogs.length} events received</span>
                </div>
                {agentLogs.map((log, idx) => (
                  <div key={idx} className="leading-snug">
                    <span className="text-slate-500">[{log.time}]</span>{' '}
                    {log.stage === 'plan' && (
                      <span className="text-teal-300 font-semibold">PLAN Checklist: {JSON.stringify(log.data.plan || log.data.message)}</span>
                    )}
                    {log.stage === 'tool_call' && (
                      <span className="text-amber-300">ACT Tool Call: {log.data.name}({JSON.stringify(log.data.args)})</span>
                    )}
                    {log.stage === 'tool_result' && (
                      <span className="text-slate-400">Result ({log.data.name}): {JSON.stringify(log.data.result).slice(0, 80)}...</span>
                    )}
                    {log.stage === 'verification' && (
                      <span className="text-emerald-300 font-semibold">Code Verification: {log.data.verifiedCount} verified, {log.data.rawCount - log.data.verifiedCount} dropped</span>
                    )}
                    {log.stage === 'tasks_saved' && (
                      <span className="text-blue-300 font-semibold">Saved {log.data.count} FHIR Tasks</span>
                    )}
                    {log.stage === 'gate' && (
                      <span className="text-purple-300 font-bold">Readiness Gate Updated: {log.data.gate}</span>
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

          {/* Audit Tasks List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                  Claim Readiness Tasks ({data.tasks.length})
                </h3>
                {openTasks.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 font-mono">
                    {openTasks.length} unresolved
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Viewing as <span className="font-bold text-[#0F2A3D] capitalize">{role}</span>
              </div>
            </div>

            {data.tasks.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-xs">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                <h4 className="font-semibold text-slate-900">No Open Readiness Issues</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Encounter record conforms to hospital billing policies and clinical documentation rules. Ready for FHIR Claim generation.
                </p>
              </div>
            ) : (
              data.tasks.map(task => {
                const isDocRole = role === 'doctor';
                const isAssignedDoctor = task.owner?.display?.toLowerCase() === 'doctor';
                const isOpen = task.status === 'requested' || task.status === 'in-progress';
                const isCompleted = task.status === 'completed';
                const isCancelled = task.status === 'cancelled';
                const severity = task.businessStatus?.text?.toLowerCase() || 'medium';

                const draftFix = task.input?.find(i => i.type?.text === 'suggested_fix')?.valueString || '';
                const evidenceNote = task.note?.[0]?.text || '';

                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-xl border transition-all bg-white shadow-xs ${
                      isCompleted
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : isCancelled
                        ? 'border-slate-200 bg-slate-50/50 opacity-80'
                        : severity === 'high'
                        ? 'border-red-200'
                        : 'border-amber-200'
                    }`}
                  >
                    {/* Header: Check & Badges */}
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

                          <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700">
                            Assigned: {task.owner?.display || 'Billing'}
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
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-md">
                            <Check className="w-3.5 h-3.5" />
                            Resolved
                          </span>
                        )}
                        {isCancelled && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-200 px-2.5 py-0.5 rounded-md">
                            Overridden
                          </span>
                        )}
                        {isOpen && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-md">
                            Open
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Verbatim Evidence Quote Box */}
                    {evidenceNote && (
                      <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                          <span className="font-semibold text-slate-700 uppercase tracking-wider">
                            Verified Source Evidence
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <Check className="w-3 h-3" />
                            Verbatim Match
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
                        <div className="flex items-center justify-between text-[#0B7A70] font-semibold text-[11px]">
                          <span>Suggested Action / Proposed Fix:</span>
                          {isDocRole && isAssignedDoctor && editingTaskId !== task.id && (
                            <button
                              onClick={() => setEditingTaskId(task.id)}
                              className="text-xs underline hover:text-[#085a53]"
                            >
                              Edit Addendum
                            </button>
                          )}
                        </div>

                        {/* If Doctor is editing this note */}
                        {isDocRole && editingTaskId === task.id ? (
                          <div className="space-y-2 mt-1">
                            <textarea
                              value={doctorDraftText[task.id] || draftFix}
                              onChange={e =>
                                setDoctorDraftText({ ...doctorDraftText, [task.id]: e.target.value })
                              }
                              rows={3}
                              className="w-full p-2 text-xs font-mono bg-white border border-[#0B7A70] rounded text-slate-900 focus:outline-hidden"
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
                                className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-[#0B7A70] text-white rounded hover:bg-[#085a53]"
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
                        <span className="font-semibold text-slate-700">Override Rationale:</span>{' '}
                        {task.statusReason.text}
                      </div>
                    )}

                    {/* Audit Trail Note List */}
                    {task.note && task.note.length > 1 && (
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                        {task.note.slice(1).map((n, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="font-mono text-slate-400">
                              {n.time ? new Date(n.time).toLocaleTimeString() : ''}
                            </span>
                            <span className="font-medium text-slate-700">{n.authorString || 'Audit'}:</span>
                            <span className="text-slate-600">{n.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Action Buttons based on Role */}
                    {isOpen && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-400 font-mono">Task ID: {task.id}</div>

                        <div className="flex items-center gap-2">
                          {/* Doctor specific flow */}
                          {isDocRole ? (
                            <>
                              <button
                                onClick={() => handleRecheckTask(task.id)}
                                disabled={isRechecking === task.id}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                              >
                                <RotateCcw className={`w-3.5 h-3.5 ${isRechecking === task.id ? 'animate-spin' : ''}`} />
                                <span>Re-check Task</span>
                              </button>

                              {isAssignedDoctor && editingTaskId !== task.id && (
                                <button
                                  onClick={() => handleDoctorApprove(task.id)}
                                  disabled={isApprovingNote === task.id}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg transition-colors shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve Draft Note</span>
                                </button>
                              )}
                            </>
                          ) : (
                            /* Billing specific flow */
                            <>
                              <button
                                onClick={() => handleOpenOverride(task)}
                                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                              >
                                Override...
                              </button>
                              <button
                                onClick={() => handleResolveTask(task.id)}
                                className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg transition-colors shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
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
                  An audit reason is required under insurance compliance to bypass this check.
                </p>
              </div>
              <button
                onClick={() => setOverrideTask(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="font-semibold text-slate-700">Check: {overrideTask.code?.text}</div>
              <div className="text-slate-600">{overrideTask.description}</div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">
                Override Reason & Clinical Exemption Details *
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

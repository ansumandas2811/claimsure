import React, { useState, useEffect } from 'react';

interface LegacyImportProps {
  onSuccess: () => void;
}

export const LegacyImport: React.FC<LegacyImportProps> = ({ onSuccess }) => {
  const [data, setData] = useState<{
    rawCsvs: { admissions: string; diagnoses: string; charges: string };
    parsedRows: { admissions: any[]; diagnoses: any[]; charges: any[] };
    fhirBundle: any;
  } | null>(null);

  const [activeCsvTab, setActiveCsvTab] = useState<'admissions' | 'diagnoses' | 'charges'>('admissions');
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
  }, []);

  const loadPreview = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/legacy/preview');
      if (!res.ok) throw new Error('Failed to load legacy data preview');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading legacy data preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    setCommitMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/legacy/commit', { method: 'POST' });
      if (!res.ok) throw new Error('Commit failed');
      const json = await res.json();
      setCommitMessage(json.message);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error committing legacy records to FHIR store');
    } finally {
      setIsCommitting(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="py-20 text-center text-slate-500">
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-[#0B7A70] border-t-transparent rounded-full animate-spin" />
          <span>Parsing legacy HIS CSVs and mapping FHIR resources...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-database text-[#0B7A70] text-lg"></i>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              Legacy Hospital Information System (HIS) Adapter
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Normalizes legacy hospital flat exports (messy dates, free-text diagnoses, and unbundled charges) into compliant FHIR R4 transactions.
          </p>
        </div>

        <button
          onClick={handleCommit}
          disabled={isCommitting}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg shadow-xs transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
        >
          {isCommitting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Writing to FHIR Store...</span>
            </>
          ) : (
            <>
              <i className="fa-solid fa-arrow-right"></i>
              <span>Write to Active FHIR Store</span>
            </>
          )}
        </button>
      </div>

      {commitMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <i className="fa-solid fa-circle-check text-emerald-600 shrink-0"></i>
          <span className="font-semibold">{commitMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
          <i className="fa-solid fa-triangle-exclamation text-red-600 shrink-0"></i>
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* Side-by-Side View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Raw CSV Preview (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[700px]">
          {/* Sub-tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <button
                onClick={() => setActiveCsvTab('admissions')}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                  activeCsvTab === 'admissions'
                    ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fa-solid fa-file-csv"></i>
                <span>admissions.csv ({data.parsedRows.admissions.length})</span>
              </button>
              <button
                onClick={() => setActiveCsvTab('diagnoses')}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                  activeCsvTab === 'diagnoses'
                    ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fa-solid fa-file-csv"></i>
                <span>diagnoses.csv ({data.parsedRows.diagnoses.length})</span>
              </button>
              <button
                onClick={() => setActiveCsvTab('charges')}
                className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors ${
                  activeCsvTab === 'charges'
                    ? 'border-[#0B7A70] text-[#0B7A70] bg-white rounded-t-md'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fa-solid fa-file-csv"></i>
                <span>charges.csv ({data.parsedRows.charges.length})</span>
              </button>
            </div>
            <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">Source: /data/legacy/</span>
          </div>

          {/* Table Container */}
          <div className="flex-1 p-3 overflow-auto">
            {activeCsvTab === 'admissions' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="py-2 px-2.5">MRN</th>
                    <th className="py-2 px-2.5">Patient Name</th>
                    <th className="py-2 px-2">Sex</th>
                    <th className="py-2 px-2.5">DOB (Messy)</th>
                    <th className="py-2 px-2.5">Admit Date (Messy)</th>
                    <th className="py-2 px-2.5">Discharge</th>
                    <th className="py-2 px-2.5">Payer / TPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.parsedRows.admissions.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 font-mono text-[11px]">
                      <td className="py-2 px-2.5 font-bold text-slate-800">{row.mrn}</td>
                      <td className="py-2 px-2.5 font-sans font-medium text-slate-900">{row.patient_name}</td>
                      <td className="py-2 px-2">{row.gender}</td>
                      <td className="py-2 px-2.5 text-slate-600">{row.dob}</td>
                      <td className="py-2 px-2.5 text-amber-700 font-semibold">{row.admit_date}</td>
                      <td className="py-2 px-2.5 text-slate-600">{row.discharge_date}</td>
                      <td className="py-2 px-2.5 text-[#0B7A70] font-sans font-medium">{row.insurance_payer || 'Navjeevan Demo TPA'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeCsvTab === 'diagnoses' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="py-2 px-2.5">MRN</th>
                    <th className="py-2 px-2.5">Timestamp</th>
                    <th className="py-2 px-2.5">Free-Text Diagnosis</th>
                    <th className="py-2 px-2.5">Severity Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.parsedRows.diagnoses.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 text-[11px]">
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-800">{row.mrn}</td>
                      <td className="py-2 px-2.5 font-mono text-slate-500">{row.admit_date}</td>
                      <td className="py-2 px-2.5 font-semibold text-slate-900">{row.free_text_diagnosis}</td>
                      <td className="py-2 px-2.5 text-slate-600">{row.severity_note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {activeCsvTab === 'charges' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="py-2 px-2.5">MRN</th>
                    <th className="py-2 px-2.5">Service Date</th>
                    <th className="py-2 px-2.5">Item Description</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-2.5 text-right">Unit Price (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.parsedRows.charges.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 text-[11px]">
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-800">{row.mrn}</td>
                      <td className="py-2 px-2.5 font-mono text-slate-500">{row.service_date}</td>
                      <td className="py-2 px-2.5 font-medium text-slate-900">{row.item_description}</td>
                      <td className="py-2 px-2 text-center font-mono">{row.quantity}</td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-800 tabular-nums">
                        ₹{row.unit_price_inr}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Resulting FHIR JSON (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 shadow-xs overflow-hidden flex flex-col h-[700px]">
          <div className="flex items-center justify-between bg-slate-950 px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <i className="fa-solid fa-code text-[#0B7A70]"></i>
              <span>Resulting FHIR R4 Transaction Bundle</span>
            </div>
            <span className="text-[11px] font-mono text-teal-400">
              {data.fhirBundle.entry?.length || 0} Entries Mapped
            </span>
          </div>

          <div className="flex-1 p-4 overflow-auto font-mono text-xs leading-relaxed">
            <pre className="text-slate-300 whitespace-pre-wrap">
              {JSON.stringify(data.fhirBundle, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { SystemStatus } from '../types.ts';

interface DocumentScannerProps {
  systemStatus: SystemStatus | null;
  onSuccess: () => void;
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ systemStatus, onSuccess }) => {
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [fileName, setFileName] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedResult, setExtractedResult] = useState<{ extractedBundle: any; rawJson: any } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate a realistic base64 synthetic invoice image dynamically using an HTML5 Canvas
  const loadSyntheticBillPreset = (patientName: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 1000);

    // Header border
    ctx.strokeStyle = '#0F2A3D';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, 740, 940);

    // Hospital Header
    ctx.fillStyle = '#0F2A3D';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('METRO APEX GENERAL HOSPITAL', 50, 80);

    ctx.fillStyle = '#0B7A70';
    ctx.font = '14px sans-serif';
    ctx.fillText('INPATIENT BILLING & DISCHARGE INVOICE · TAX INVOICE', 50, 110);

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('Metro Apex Hospitals, Park Circus, Kolkata, WB 700017', 50, 130);
    ctx.fillText('NABH & JCI Accredited · GSTIN: 19AAACA1234F1Z5', 50, 150);

    // Divider
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 170);
    ctx.lineTo(750, 170);
    ctx.stroke();

    // Patient Demographics
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('PATIENT DETAILS', 50, 200);

    ctx.font = '13px sans-serif';
    ctx.fillText(`Patient Name: ${patientName}`, 50, 230);
    ctx.fillText('MRN: IN-METRO-98442', 50, 255);
    ctx.fillText('Gender: Female', 50, 280);
    ctx.fillText('Admit Date: 2026-03-18', 420, 230);
    ctx.fillText('Discharge Date: 2026-03-21', 420, 255);
    ctx.fillText('TPA: Navjeevan Demo TPA (Kavach Demo General Insurance)', 420, 280);

    // Diagnosis Box
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(50, 310, 700, 50);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(50, 310, 700, 50);

    ctx.fillStyle = '#0F2A3D';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('FINAL CLINICAL DIAGNOSIS: Acute Calculous Cholecystitis (ICD-10: K80.20)', 65, 340);

    // Charges Table Header
    ctx.fillStyle = '#0F2A3D';
    ctx.fillRect(50, 380, 700, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('SL', 65, 400);
    ctx.fillText('ITEMIZED DESCRIPTION', 110, 400);
    ctx.fillText('QTY', 520, 400);
    ctx.fillText('TOTAL AMOUNT (INR)', 610, 400);

    // Charge Rows
    const items = [
      ['01', 'Laparoscopic Cholecystectomy OR Charges', '1', '45,000.00'],
      ['02', 'General Semi-Private Ward Bed (3 days @ ₹4,500)', '3', '13,500.00'],
      ['03', 'Anesthesia Professional Administration', '1', '12,000.00'],
      ['04', 'Pre-op Abdominal Ultrasound & CBC Panel', '1', '4,800.00'],
      ['05', 'Post-Op Surgical Consumables & Medication', '1', '7,200.00'],
    ];

    let y = 435;
    ctx.fillStyle = '#1e293b';
    ctx.font = '12px monospace';
    items.forEach((row) => {
      ctx.fillText(row[0], 65, y);
      ctx.font = '12px sans-serif';
      ctx.fillText(row[1], 110, y);
      ctx.font = '12px monospace';
      ctx.fillText(row[2], 530, y);
      ctx.fillText(row[3], 630, y);
      y += 35;
    });

    // Total Box
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(450, 640, 300, 45);
    ctx.fillStyle = '#0F2A3D';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('TOTAL DUE: ₹82,500.00', 470, 668);

    // Doctor Signature
    ctx.fillStyle = '#475569';
    ctx.font = 'italic 16px serif';
    ctx.fillText('Dr. R. K. Banerjee, MS, FRCS', 480, 780);
    ctx.font = '11px sans-serif';
    ctx.fillText('Chief Consultant Gastrointestinal Surgeon', 480, 800);

    // Stamp
    ctx.strokeStyle = '#0B7A70';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(600, 860, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#0B7A70';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('METRO APEX', 555, 855);
    ctx.fillText('HOSPITAL VERIFIED', 558, 870);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    const base64Only = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

    setFileBase64(base64Only);
    setMimeType('image/jpeg');
    setFileName(`MetroApex_Invoice_${patientName.replace(' ', '_')}.jpg`);
    setExtractedResult(null);
    setSaveSuccess(false);
    setError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setMimeType(file.type || 'image/jpeg');
    setExtractedResult(null);
    setSaveSuccess(false);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      setFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    if (!fileBase64) return;
    setIsExtracting(true);
    setError(null);
    try {
      const res = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: fileBase64, mimeType }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Multimodal document extraction failed');
      }

      const json = await res.json();
      setExtractedResult(json);
    } catch (err: any) {
      setError(err.message || 'Error running multimodal extraction');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!extractedResult) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/documents/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: extractedResult.extractedBundle }),
      });
      if (!res.ok) throw new Error('Failed to save extracted encounter');
      setSaveSuccess(true);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error saving extracted bundle');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-file-invoice text-[#0B7A70] text-lg"></i>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              Scanned Clinical Documents & Invoice Ingestion
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Multimodal document parser ingests scanned bills and discharge summaries into structured FHIR R4 encounters.
          </p>
        </div>
      </div>

      {/* Preset Quick Load */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-700">
          <span className="font-bold block text-slate-900">Need a sample hospital bill to test?</span>
          <span>Click the button to load an authentic synthetic Indian hospital invoice into memory.</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadSyntheticBillPreset('Neelam Sengupta')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B7A70] bg-white border border-[#0B7A70]/40 rounded-lg hover:bg-teal-50 transition-colors shadow-xs cursor-pointer"
          >
            <i className="fa-solid fa-file-arrow-up"></i>
            <span>Load Sample Inpatient Bill</span>
          </button>
        </div>
      </div>

      {/* Upload & Preview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: File Upload & Document Preview (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900 font-display">1. Select or Upload Document</h2>

          <label className="border-2 border-dashed border-slate-300 hover:border-[#0B7A70] rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-slate-50">
            <i className="fa-solid fa-image text-slate-400 text-3xl mb-2"></i>
            <span className="text-xs font-bold text-slate-700">Click to upload bill image or document</span>
            <span className="text-[11px] text-slate-400 mt-1">Supports PNG, JPG, or PDF</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {fileName && (
            <div className="p-3 bg-slate-100 rounded-lg text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <i className="fa-solid fa-file-lines text-[#0B7A70] shrink-0"></i>
                <span className="font-medium text-slate-800 truncate">{fileName}</span>
              </div>
              <span className="text-[10px] uppercase font-mono text-slate-500">{mimeType.split('/')[1]}</span>
            </div>
          )}

          {fileBase64 && (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 flex items-center justify-center bg-slate-100">
                <img
                  src={`data:${mimeType};base64,${fileBase64}`}
                  alt="Document Preview"
                  className="object-contain max-h-72 w-full"
                />
              </div>

              <button
                onClick={handleExtract}
                disabled={isExtracting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isExtracting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Extracting Structured FHIR Data...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Extract Structured FHIR Data</span>
                  </>
                )}
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation text-red-600 shrink-0 mt-0.5"></i>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right: Extracted Result & Confirmation (7 cols) */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 font-display">2. Structured Review & Confirmation</h2>
            {extractedResult && (
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                Extraction Verified
              </span>
            )}
          </div>

          {!extractedResult ? (
            <div className="py-24 text-center text-slate-400 text-xs">
              <i className="fa-solid fa-file-invoice text-3xl text-slate-300 block mb-2"></i>
              <span>Upload or select a sample bill on the left, then click "Extract Structured FHIR Data" to review fields.</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Parsed Summary Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Patient Name</span>
                    <span className="font-bold text-slate-900 text-sm">{extractedResult.rawJson.patientName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">MRN Identifier</span>
                    <span className="font-mono font-semibold text-slate-800">{extractedResult.rawJson.mrn || 'Auto-generated'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Encounter Dates</span>
                    <span className="font-mono text-slate-700">
                      {extractedResult.rawJson.admissionDate} to {extractedResult.rawJson.dischargeDate}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Primary Diagnosis</span>
                    <span className="font-semibold text-slate-800">
                      {extractedResult.rawJson.diagnosis} {extractedResult.rawJson.icdCode && `(${extractedResult.rawJson.icdCode})`}
                    </span>
                  </div>
                </div>

                {/* Extracted Charges */}
                <div className="pt-2 border-t border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1.5">Extracted Itemized Charges:</span>
                  <div className="space-y-1">
                    {extractedResult.rawJson.charges?.map((c: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0">
                        <span className="text-slate-800 font-medium">{c.description}</span>
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          ₹{c.totalAmountInr?.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Confirmation Action */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">
                  Ready to add to active hospital worklist.
                </span>

                <button
                  onClick={handleConfirmSave}
                  disabled={isSaving || saveSuccess}
                  className={`flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-lg shadow-xs transition-all ${
                    saveSuccess
                      ? 'bg-emerald-600 text-white cursor-default'
                      : 'bg-[#0B7A70] hover:bg-[#085a53] text-white cursor-pointer'
                  }`}
                >
                  {isSaving ? (
                    'Saving Encounter...'
                  ) : saveSuccess ? (
                    <>
                      <i className="fa-solid fa-check"></i>
                      <span>Saved to FHIR Store!</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check"></i>
                      <span>Confirm & Add to Worklist</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { UserRole } from '../types.ts';

interface ProfileSettingsProps {
  role: UserRole;
  setRole: (role: UserRole) => void;
  onSaveToast: (msg: string) => void;
}

export interface AuditSettingsState {
  userName: string;
  userRoleTitle: string;
  department: string;
  licenseNumber: string;
  flagFrequency: 'strict' | 'standard' | 'lenient';
  roomRentLimitInr: number;
  requireIcuVitals: boolean;
  duplicateWindowHours: number;
  autoAuditOnImport: boolean;
  blockCosmeticExclusions: boolean;
  notifyOnHighSeverity: boolean;
}

export const defaultSettings: AuditSettingsState = {
  userName: 'Dr. Aarav Sundaram, MD',
  userRoleTitle: 'Chief Medical Director & Inpatient Audit Lead',
  department: 'Medical Directorate & Revenue Cycle Management',
  licenseNumber: 'MCI-WB-2018-99412',
  flagFrequency: 'standard',
  roomRentLimitInr: 5000,
  requireIcuVitals: true,
  duplicateWindowHours: 24,
  autoAuditOnImport: true,
  blockCosmeticExclusions: true,
  notifyOnHighSeverity: true,
};

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  role,
  setRole,
  onSaveToast,
}) => {
  const [settings, setSettings] = useState<AuditSettingsState>(() => {
    try {
      const stored = localStorage.getItem('claimsure_settings');
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const [activeTab, setActiveTab] = useState<'audit_rules' | 'profile'>('audit_rules');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    try {
      localStorage.setItem('claimsure_settings', JSON.stringify(settings));
      setIsSaved(true);
      onSaveToast('Audit sensitivity and profile settings successfully updated.');
      setTimeout(() => setIsSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleResetDefaults = () => {
    setSettings(defaultSettings);
    localStorage.removeItem('claimsure_settings');
    onSaveToast('Settings reset to hospital standard baseline.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-sliders text-[#0B7A70] text-lg"></i>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              Audit Rule Settings & Auditor Profile
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure claim-readiness flag frequency, room tariff thresholds, ICU necessity criteria, and reviewer credentials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg transition-colors shadow-xs"
          >
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg shadow-xs transition-colors"
          >
            <i className="fa-solid fa-floppy-disk"></i>
            <span>{isSaved ? 'Saved!' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('audit_rules')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'audit_rules'
              ? 'border-[#0B7A70] text-[#0B7A70]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <i className="fa-solid fa-scale-balanced"></i>
          <span>Flag Frequency & Policy Thresholds</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'profile'
              ? 'border-[#0B7A70] text-[#0B7A70]'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <i className="fa-solid fa-user-doctor"></i>
          <span>Auditor Identity & Workspace Role</span>
        </button>
      </div>

      {activeTab === 'audit_rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Flag Frequency Control (7 cols) */}
          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
                1. Claim Flagging Frequency & Audit Sensitivity
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Controls how aggressively ClaimSure flags potential discrepancies before TPA submission.
              </p>
            </div>

            {/* 3 Sensitivity Modes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Strict Mode */}
              <div
                onClick={() => setSettings({ ...settings, flagFrequency: 'strict' })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.flagFrequency === 'strict'
                    ? 'border-red-500 bg-red-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-red-700">Strict (High-Freq)</span>
                  <i className="fa-solid fa-shield-halved text-red-600 text-sm"></i>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Zero tolerance for room rent variance. Flags all repeat labs within 48h and every undocumented ICU observation hour.
                </p>
                <div className="mt-2 text-[10px] font-mono font-semibold text-red-700 uppercase">
                  Max Denial Protection
                </div>
              </div>

              {/* Standard Mode (Recommended) */}
              <div
                onClick={() => setSettings({ ...settings, flagFrequency: 'standard' })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.flagFrequency === 'standard'
                    ? 'border-[#0B7A70] bg-teal-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-[#0B7A70]">Standard (Balanced)</span>
                  <i className="fa-solid fa-circle-check text-[#0B7A70] text-sm"></i>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Enforces Navjeevan TPA standard policy sub-limits, mandatory discharge documentation, and identical timestamp duplicates.
                </p>
                <div className="mt-2 text-[10px] font-mono font-semibold text-[#0B7A70] uppercase">
                  (Recommended)
                </div>
              </div>

              {/* Lenient Mode */}
              <div
                onClick={() => setSettings({ ...settings, flagFrequency: 'lenient' })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  settings.flagFrequency === 'lenient'
                    ? 'border-amber-500 bg-amber-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-amber-800">Lenient (Low-Freq)</span>
                  <i className="fa-solid fa-clock text-amber-600 text-sm"></i>
                </div>
                <p className="text-[11px] text-slate-600 leading-snug">
                  Only blocks statutory exclusions and confirmed duplicate CPT codes. Leaves minor tariff variances to manual billing.
                </p>
                <div className="mt-2 text-[10px] font-mono font-semibold text-amber-800 uppercase">
                  Fastest Throughput
                </div>
              </div>
            </div>

            {/* Granular Policy Thresholds */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                2. Sub-Limit & Documentation Thresholds
              </h3>

              {/* Room Rent Limit */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Room Rent Daily Sub-Limit (INR)
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Flag any standard room tariff exceeding this daily amount (Clause 1).
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-700">₹</span>
                  <input
                    type="number"
                    value={settings.roomRentLimitInr}
                    onChange={e => setSettings({ ...settings, roomRentLimitInr: Number(e.target.value) || 0 })}
                    className="w-28 px-2.5 py-1 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-[#0B7A70]"
                  />
                  <span className="text-[11px] text-slate-400">/day</span>
                </div>
              </div>

              {/* ICU Vitals Verification */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Require Documented Physiological Instability for ICU
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Block claims where ICU days are billed with stable vitals and no clinical rationale.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.requireIcuVitals}
                  onChange={e => setSettings({ ...settings, requireIcuVitals: e.target.checked })}
                  className="w-4 h-4 text-[#0B7A70] rounded border-slate-300 focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Duplicate Window */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Duplicate Charge Detection Window
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Lookback horizon for identical radiology or pathology procedures.
                  </span>
                </div>
                <select
                  value={settings.duplicateWindowHours}
                  onChange={e => setSettings({ ...settings, duplicateWindowHours: Number(e.target.value) })}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:border-[#0B7A70]"
                >
                  <option value={0}>Exact Identical Timestamp Only</option>
                  <option value={24}>Same Calendar Day (24 Hours)</option>
                  <option value={48}>Within 48 Hours</option>
                  <option value={72}>Full Inpatient Stay (72+ Hours)</option>
                </select>
              </div>

              {/* Auto Audit on Import */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">
                    Auto-Run Audit on Legacy Import & Document Scan
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Immediately run readiness checks whenever new encounters are added to the FHIR store.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoAuditOnImport}
                  onChange={e => setSettings({ ...settings, autoAuditOnImport: e.target.checked })}
                  className="w-4 h-4 text-[#0B7A70] rounded border-slate-300 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right: Policy Summary & Active Rules (5 cols) */}
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
              Active Policy Engine Summary
            </h2>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Payer Spec:</span>
                <span className="font-semibold text-slate-900">Navjeevan Demo TPA 2026</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Audit Engine:</span>
                <span className="font-semibold text-[#0B7A70]">Deterministic + Gemini Multimodal</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Strictness Tier:</span>
                <span className="font-bold text-slate-900 uppercase font-mono">{settings.flagFrequency}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Room Rent Limit:</span>
                <span className="font-mono font-bold text-slate-900">₹{settings.roomRentLimitInr.toLocaleString('en-IN')}/day</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">ICU Rule:</span>
                <span className="font-semibold text-red-700">Instability Documentation Required</span>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <i className="fa-solid fa-triangle-exclamation text-amber-600"></i> Regulatory Compliance Notice
              </span>
              <p className="text-[11px] text-amber-800 leading-snug">
                Under IRDAI Master Circular on Health Insurance, any hospital billing override must preserve a permanent audit trail with author attribution and clinical rationale.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="max-w-2xl bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-display">
              Auditor Identity & Role Attribution
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              These details are stamped on FHIR Task resolutions, doctor addenda, and insurance claim pre-authorizations.
            </p>
          </div>

          {/* Active Role Selector */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Current Active Workspace Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('billing')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  role === 'billing'
                    ? 'border-[#0B7A70] bg-white text-[#0F2A3D] shadow-xs font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="fa-solid fa-file-invoice-dollar text-[#0B7A70]"></i>
                  <span className="text-xs font-bold">Billing Specialist</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal block">
                  Manages tariff adjustments, duplicates & regulatory overrides.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRole('doctor')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  role === 'doctor'
                    ? 'border-indigo-600 bg-white text-[#0F2A3D] shadow-xs font-bold'
                    : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <i className="fa-solid fa-stethoscope text-indigo-600"></i>
                  <span className="text-xs font-bold">Doctor / Medical Director</span>
                </div>
                <span className="text-[11px] text-slate-500 font-normal block">
                  Reviews clinical discharge summaries & approves addenda.
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Name & Degree</label>
              <input
                type="text"
                value={settings.userName}
                onChange={e => setSettings({ ...settings, userName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-[#0B7A70]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Professional Title</label>
              <input
                type="text"
                value={settings.userRoleTitle}
                onChange={e => setSettings({ ...settings, userRoleTitle: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-[#0B7A70]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={settings.department}
                  onChange={e => setSettings({ ...settings, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-[#0B7A70]"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Medical Reg / TPA License</label>
                <input
                  type="text"
                  value={settings.licenseNumber}
                  onChange={e => setSettings({ ...settings, licenseNumber: e.target.value })}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-[#0B7A70]"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#0B7A70] hover:bg-[#085a53] rounded-lg shadow-xs transition-colors"
            >
              <i className="fa-solid fa-floppy-disk"></i>
              <span>Save Profile & Role</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

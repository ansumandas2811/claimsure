import React from 'react';
import { Database, ShieldCheck, Stethoscope, RefreshCw, AlertTriangle, FileText, UploadCloud, ListChecks } from 'lucide-react';
import { SystemStatus, UserRole } from '../types.ts';

interface HeaderProps {
  activeTab: 'worklist' | 'legacy' | 'scanner' | 'policy';
  setActiveTab: (tab: 'worklist' | 'legacy' | 'scanner' | 'policy') => void;
  status: SystemStatus | null;
  role: UserRole;
  setRole: (role: UserRole) => void;
  onResetDemo: () => void;
  isResetting: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  status,
  role,
  setRole,
  onResetDemo,
  isResetting,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Universal Mandatory Demo Banner */}
      <div className="bg-[#0F2A3D] text-slate-200 text-xs py-1 px-4 text-center tracking-wide font-medium flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0B7A70]" aria-hidden="true" />
        <span>Demo uses synthetic data only.</span>
        <span className="text-slate-400 font-mono text-[11px] ml-2 hidden sm:inline">
          Navjeevan Demo TPA / Indian Healthcare Specifications
        </span>
      </div>

      {/* Main Top Bar: 3-Zone Contract */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('worklist')}
            className="flex items-center gap-2.5 text-left focus-visible:outline-hidden"
          >
            <div className="w-9 h-9 rounded-lg bg-[#0B7A70] flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-[#0F2A3D] block leading-none font-display">
                ClaimSure
              </span>
              <span className="text-[10px] text-slate-500 font-medium tracking-wider uppercase block mt-0.5">
                Hospital Claim-Readiness
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('worklist')}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'worklist'
                ? 'text-[#0B7A70] font-semibold border-b-2 border-[#0B7A70]'
                : 'hover:text-[#0F2A3D]'
            }`}
          >
            <ListChecks className="w-4 h-4" />
            Worklist
          </button>
          <button
            onClick={() => setActiveTab('legacy')}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'legacy'
                ? 'text-[#0B7A70] font-semibold border-b-2 border-[#0B7A70]'
                : 'hover:text-[#0F2A3D]'
            }`}
          >
            <Database className="w-4 h-4" />
            Legacy HIS Import
          </button>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'scanner'
                ? 'text-[#0B7A70] font-semibold border-b-2 border-[#0B7A70]'
                : 'hover:text-[#0F2A3D]'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            Scanned Documents
          </button>
          <button
            onClick={() => setActiveTab('policy')}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'policy'
                ? 'text-[#0B7A70] font-semibold border-b-2 border-[#0B7A70]'
                : 'hover:text-[#0F2A3D]'
            }`}
          >
            <FileText className="w-4 h-4" />
            TPA Policy Clauses
          </button>
        </nav>

        {/* Zone 3: Primary Actions & Role Controls */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Active FHIR Backend Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs text-slate-700">
            <span className="text-slate-400 font-medium">FHIR store:</span>
            <span className="font-semibold text-slate-800">
              {status?.activeBackend === 'healthcare_api' ? 'Cloud Healthcare API' : 'Local FHIR files'}
            </span>
          </div>

          {/* Role Switcher */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setRole('billing')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                role === 'billing'
                  ? 'bg-white text-[#0F2A3D] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Switch to Billing Specialist Workspace"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#0B7A70]" />
              Billing Specialist
            </button>
            <button
              onClick={() => setRole('doctor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                role === 'doctor'
                  ? 'bg-white text-[#0F2A3D] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Switch to Physician / Medical Director Desk"
            >
              <Stethoscope className="w-3.5 h-3.5 text-indigo-600" />
              Doctor Desk
            </button>
          </div>

          {/* Reset Demo Button */}
          <button
            onClick={onResetDemo}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
            title="Reset active backend with fresh synthetic seeds"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin text-[#0B7A70]' : ''}`} />
            <span className="hidden sm:inline">Reset demo</span>
          </button>
        </div>
      </div>
    </header>
  );
};

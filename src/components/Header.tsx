import React from 'react';
import { NavTab } from './Sidebar.tsx';
import { SystemStatus, UserRole } from '../types.ts';

interface HeaderProps {
  activeTab: NavTab;
  selectedEncounterId: string | null;
  onClearSelectedEncounter: () => void;
  status: SystemStatus | null;
  role: UserRole;
  setRole: (role: UserRole) => void;
  onResetDemo: () => void;
  isResetting: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  selectedEncounterId,
  onClearSelectedEncounter,
  status,
  role,
  setRole,
  onResetDemo,
  isResetting,
}) => {
  const getTabLabel = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return 'Dashboard';
      case 'worklist':
        return 'Worklist';
      case 'scanner':
        return 'Invoice Scanner';
      case 'legacy':
        return 'HIS Import';
      case 'policy':
        return 'TPA Policies';
      case 'settings':
        return 'Settings';
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 shrink-0 z-20">
      {/* Universal Mandatory Demo Disclaimer Strip */}
      <div className="bg-[#0F2A3D] text-slate-200 text-xs py-1 px-4 text-center tracking-wide font-medium flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0B7A70]" aria-hidden="true" />
        <span>Demo uses synthetic data only.</span>
        <span className="text-teal-400 font-mono text-[11px] ml-2 hidden sm:inline">
          Navjeevan Demo TPA / Indian Healthcare Specification · INR ₹
        </span>
      </div>

      {/* Main Top Header Bar: 3 Zones */}
      <div className="px-5 h-14 flex items-center justify-between gap-6">
        {/* Zone 1: Breadcrumb Trail */}
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span className="font-bold text-slate-800">ClaimSure</span>
          <i className="fa-solid fa-chevron-right text-[10px] text-slate-300"></i>
          <span className="text-[#0B7A70] font-bold">{getTabLabel(activeTab)}</span>
          {selectedEncounterId && (
            <>
              <i className="fa-solid fa-chevron-right text-[10px] text-slate-300"></i>
              <button
                onClick={onClearSelectedEncounter}
                className="font-mono font-bold text-[#0B7A70] hover:underline"
              >
                {selectedEncounterId}
              </button>
            </>
          )}
        </div>

        {/* Zone 2: Role Switcher & Backend Info */}
        <div className="flex items-center gap-3">
          {/* Active Backend Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md border border-slate-200 text-xs text-slate-700">
            <span className="text-slate-400 font-medium">FHIR:</span>
            <span className="font-semibold text-slate-800">
              {status?.activeBackend === 'healthcare_api' ? 'Cloud Healthcare API' : 'Local FHIR files'}
            </span>
          </div>

          {/* Role Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setRole('billing')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                role === 'billing'
                  ? 'bg-white text-[#0F2A3D] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Switch to Billing Specialist Workspace"
            >
              <i className="fa-solid fa-file-invoice-dollar text-[#0B7A70]"></i>
              <span className="hidden sm:inline">Billing Desk</span>
            </button>
            <button
              onClick={() => setRole('doctor')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                role === 'doctor'
                  ? 'bg-white text-[#0F2A3D] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Switch to Physician / Medical Director Desk"
            >
              <i className="fa-solid fa-stethoscope text-indigo-600"></i>
              <span className="hidden sm:inline">Doctor Desk</span>
            </button>
          </div>

          {/* Quick Demo Reset */}
          <button
            onClick={onResetDemo}
            disabled={isResetting}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            title="Reset active backend with fresh synthetic seeds"
          >
            <i className={`fa-solid fa-arrows-rotate text-xs ${isResetting ? 'animate-spin text-[#0B7A70]' : ''}`}></i>
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>
    </header>
  );
};

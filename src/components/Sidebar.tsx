import React from 'react';
import { SystemStatus, UserRole } from '../types.ts';

export type NavTab = 'dashboard' | 'worklist' | 'legacy' | 'scanner' | 'policy' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  status: SystemStatus | null;
  role: UserRole;
  setRole: (role: UserRole) => void;
  onResetDemo: () => void;
  isResetting: boolean;
  pendingTasksCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  status,
  role,
  setRole,
  onResetDemo,
  isResetting,
  pendingTasksCount,
}) => {
  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: string;
    badge?: number;
    badgeColor?: string;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
    {
      id: 'worklist',
      label: 'Claim Worklist',
      icon: 'fa-clipboard-list',
      badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
      badgeColor: 'bg-red-600 text-white',
    },
    { id: 'scanner', label: 'Invoice Scanner', icon: 'fa-file-invoice' },
    { id: 'legacy', label: 'Legacy HIS Import', icon: 'fa-database' },
    { id: 'policy', label: 'TPA Policies', icon: 'fa-shield-halved' },
    { id: 'settings', label: 'Audit & Profile', icon: 'fa-sliders' },
  ];

  return (
    <aside
      className={`h-screen bg-[#0F2A3D] text-slate-200 border-r border-slate-800 flex flex-col shrink-0 transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-3.5 border-b border-slate-800/80 justify-between">
        <button
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-2.5 text-left focus:outline-hidden group overflow-hidden"
          title="ClaimSure Claim-Readiness Agent"
        >
          <div className="w-9 h-9 rounded-lg bg-[#0B7A70] flex items-center justify-center text-white shrink-0 shadow-xs">
            <i className="fa-solid fa-shield-halved text-base"></i>
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <span className="text-base font-bold tracking-tight text-white block leading-none font-display">
                ClaimSure
              </span>
              <span className="text-[10px] text-teal-400 font-semibold tracking-wider uppercase block mt-1">
                Hospital Readiness
              </span>
            </div>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors shrink-0"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <i className={`fa-solid ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-xs`}></i>
        </button>
      </div>

      {/* Role Indicator Banner */}
      <div className="px-3 py-2 border-b border-slate-800/60 bg-[#0a1c29]/70">
        {!isCollapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs">
              <i
                className={`fa-solid ${
                  role === 'doctor' ? 'fa-stethoscope text-indigo-400' : 'fa-file-invoice-dollar text-[#0B7A70]'
                }`}
              ></i>
              <span className="text-[11px] font-semibold text-slate-300">
                {role === 'doctor' ? 'Doctor Desk' : 'Billing Specialist'}
              </span>
            </div>
            <button
              onClick={() => setRole(role === 'doctor' ? 'billing' : 'doctor')}
              className="text-[10px] uppercase font-mono font-bold text-teal-400 hover:text-teal-300 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
              title="Switch role"
            >
              Switch
            </button>
          </div>
        ) : (
          <button
            onClick={() => setRole(role === 'doctor' ? 'billing' : 'doctor')}
            className="w-full flex justify-center py-1 text-slate-300 hover:text-white"
            title={`Active role: ${role === 'doctor' ? 'Doctor Desk' : 'Billing Specialist'}. Click to switch.`}
          >
            <i
              className={`fa-solid ${
                role === 'doctor' ? 'fa-stethoscope text-indigo-400' : 'fa-file-invoice-dollar text-[#0B7A70]'
              } text-sm`}
            ></i>
          </button>
        )}
      </div>

      {/* Main Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center rounded-lg text-xs font-semibold transition-all group ${
                isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-[#0B7A70] text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <i
                className={`fa-solid ${item.icon} text-sm shrink-0 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              ></i>

              {!isCollapsed && (
                <div className="flex-1 flex items-center justify-between text-left truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full ${
                        item.badgeColor || 'bg-slate-700 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info & Actions */}
      <div className="p-3 border-t border-slate-800/80 space-y-2 bg-[#0a1c29]/50">
        {/* Backend Indicator */}
        {!isCollapsed && (
          <div className="px-2.5 py-1.5 bg-slate-900/80 rounded-md border border-slate-800 text-[11px] text-slate-400">
            <div className="text-[10px] uppercase font-mono text-slate-500">Active FHIR Store</div>
            <div className="font-semibold text-slate-200 truncate mt-0.5">
              {status?.activeBackend === 'healthcare_api' ? 'Cloud Healthcare API' : 'Local FHIR Files'}
            </div>
          </div>
        )}

        {/* Reset Demo button */}
        <button
          onClick={onResetDemo}
          disabled={isResetting}
          className={`w-full flex items-center rounded-lg text-xs font-medium border border-slate-700 bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-50 ${
            isCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2'
          }`}
          title="Reset active backend with fresh synthetic demo encounters"
        >
          <i className={`fa-solid fa-arrows-rotate text-xs ${isResetting ? 'animate-spin text-teal-400' : ''}`}></i>
          {!isCollapsed && <span>{isResetting ? 'Re-seeding...' : 'Reset Demo'}</span>}
        </button>

        {/* Demo synthetic badge */}
        {!isCollapsed && (
          <div className="text-[10px] text-slate-500 text-center font-mono pt-1">
            Navjeevan Demo TPA · INR ₹
          </div>
        )}
      </div>
    </aside>
  );
};

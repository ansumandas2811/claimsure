import React, { useState, useEffect } from 'react';
import { Sidebar, NavTab } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { EncounterTable } from './components/EncounterTable.tsx';
import { ReviewDesk } from './components/ReviewDesk.tsx';
import { LegacyImport } from './components/LegacyImport.tsx';
import { DocumentScanner } from './components/DocumentScanner.tsx';
import { PolicyViewer } from './components/PolicyViewer.tsx';
import { ProfileSettings } from './components/ProfileSettings.tsx';
import { LegendBar } from './components/LegendBar.tsx';
import { EncounterSummary, ReadinessGate, SystemStatus, UserRole } from './types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [worklistFilter, setWorklistFilter] = useState<ReadinessGate | 'all'>('all');
  const [role, setRole] = useState<UserRole>('billing');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('claimsure_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const handleSetIsCollapsed = (val: boolean) => {
    setIsCollapsed(val);
    try {
      localStorage.setItem('claimsure_sidebar_collapsed', String(val));
    } catch {}
  };

  useEffect(() => {
    loadStatus();
    loadEncounters();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const json = await res.json();
        setStatus(json);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const loadEncounters = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/encounters');
      if (res.ok) {
        const json = await res.json();
        setEncounters(json);
      }
    } catch (err) {
      console.error('Failed to load encounters:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDemo = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      const json = await res.json();
      showToast(json.message || 'Demo backend re-seeded successfully.');
      await loadEncounters();
      if (selectedEncounterId) {
        // stay on encounter review
      }
    } catch (err: any) {
      showToast(err.message || 'Error resetting demo');
    } finally {
      setIsResetting(false);
    }
  };

  const handleNavigateToWorklist = (filter: ReadinessGate | 'all' = 'all') => {
    setWorklistFilter(filter);
    setActiveTab('worklist');
    setSelectedEncounterId(null);
  };

  const pendingTasksTotal = encounters.reduce((sum, e) => sum + e.tasksCount.open, 0);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#F8FAFC] text-slate-900 flex flex-row font-sans">
      {/* Collapsible & Expandable Left Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={tab => {
          setActiveTab(tab);
          setSelectedEncounterId(null);
        }}
        isCollapsed={isCollapsed}
        setIsCollapsed={handleSetIsCollapsed}
        status={status}
        role={role}
        setRole={setRole}
        onResetDemo={handleResetDemo}
        isResetting={isResetting}
        pendingTasksCount={pendingTasksTotal}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 h-full flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <Header
          activeTab={activeTab}
          selectedEncounterId={selectedEncounterId}
          onClearSelectedEncounter={() => {
            setSelectedEncounterId(null);
            loadEncounters();
          }}
          status={status}
          role={role}
          setRole={setRole}
          onResetDemo={handleResetDemo}
          isResetting={isResetting}
        />

        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 bg-[#0F2A3D] text-white text-xs py-2.5 px-4 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
            <span className="w-2 h-2 rounded-full bg-[#0B7A70]" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Scrollable Main Area (Guaranteed No Viewport Overflow) */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 min-h-0">
          <div className="max-w-7xl mx-auto space-y-5">
            {/* Compact LegendBar specifically on Worklist only */}
            {activeTab === 'worklist' && !selectedEncounterId && (
              <LegendBar />
            )}

            {/* View Router */}
            {selectedEncounterId ? (
              <ReviewDesk
                encounterId={selectedEncounterId}
                onBack={() => {
                  setSelectedEncounterId(null);
                  loadEncounters();
                }}
                role={role}
                systemStatus={status}
                onRefreshSummary={loadEncounters}
              />
            ) : (
              <>
                {activeTab === 'dashboard' && (
                  <Dashboard
                    encounters={encounters}
                    onSelectEncounter={id => setSelectedEncounterId(id)}
                    onNavigateToWorklist={handleNavigateToWorklist}
                    role={role}
                  />
                )}

                {activeTab === 'worklist' && (
                  <EncounterTable
                    encounters={encounters}
                    onSelectEncounter={id => setSelectedEncounterId(id)}
                    isLoading={isLoading}
                    initialFilter={worklistFilter}
                    onRefresh={loadEncounters}
                  />
                )}

                {activeTab === 'scanner' && (
                  <DocumentScanner
                    systemStatus={status}
                    onSuccess={() => {
                      loadEncounters();
                      showToast('Scanned invoice converted to FHIR encounter and added to worklist.');
                    }}
                  />
                )}

                {activeTab === 'legacy' && (
                  <LegacyImport
                    onSuccess={() => {
                      loadEncounters();
                      showToast('Legacy HIS admissions and charges committed to active FHIR store.');
                    }}
                  />
                )}

                {activeTab === 'policy' && <PolicyViewer />}

                {activeTab === 'settings' && (
                  <ProfileSettings
                    role={role}
                    setRole={setRole}
                    onSaveToast={showToast}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

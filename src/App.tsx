import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { EncounterTable } from './components/EncounterTable.tsx';
import { ReviewDesk } from './components/ReviewDesk.tsx';
import { LegacyImport } from './components/LegacyImport.tsx';
import { DocumentScanner } from './components/DocumentScanner.tsx';
import { PolicyViewer } from './components/PolicyViewer.tsx';
import { EncounterSummary, SystemStatus, UserRole } from './types.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<'worklist' | 'legacy' | 'scanner' | 'policy'>('worklist');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>('billing');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    loadEncounters();
  }, []);

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
      setToastMessage(json.message || 'Demo backend re-seeded successfully.');
      setTimeout(() => setToastMessage(null), 4000);
      await loadEncounters();
      if (selectedEncounterId) {
        // reload current encounter
      }
    } catch (err: any) {
      setToastMessage(err.message || 'Error resetting demo');
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={tab => {
          setActiveTab(tab);
          setSelectedEncounterId(null);
        }}
        status={status}
        role={role}
        setRole={setRole}
        onResetDemo={handleResetDemo}
        isResetting={isResetting}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-[#0F2A3D] text-white text-xs py-2.5 px-4 rounded-lg shadow-lg border border-slate-700 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#0B7A70]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
            {activeTab === 'worklist' && (
              <EncounterTable
                encounters={encounters}
                onSelectEncounter={id => setSelectedEncounterId(id)}
                isLoading={isLoading}
              />
            )}
            {activeTab === 'legacy' && (
              <LegacyImport
                onSuccess={() => {
                  loadEncounters();
                  setToastMessage('Legacy data imported into active FHIR store.');
                  setTimeout(() => setToastMessage(null), 4000);
                }}
              />
            )}
            {activeTab === 'scanner' && (
              <DocumentScanner
                systemStatus={status}
                onSuccess={() => {
                  loadEncounters();
                  setToastMessage('Scanned document converted to FHIR encounter.');
                  setTimeout(() => setToastMessage(null), 4000);
                }}
              />
            )}
            {activeTab === 'policy' && <PolicyViewer />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-slate-700">ClaimSure</span> · Hospital Claim-Readiness & Pre-Submission Audit Agent
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            FHIR R4 Standard · Navjeevan Demo TPA / Indian Healthcare Specification · Synthetic Data
          </div>
        </div>
      </footer>
    </div>
  );
}

export type ReadinessGate = 'Blocked' | 'Needs review' | 'Ready';
export type UserRole = 'billing' | 'doctor';

export interface EncounterSummary {
  id: string;
  patientId: string;
  patientName: string;
  gender: string;
  birthDate: string;
  period: { start?: string; end?: string };
  payorDisplay: string;
  payerPlan: string;
  diagnosis: string;
  diagnosisCode: string;
  totalInr: number;
  gate: ReadinessGate;
  tasksCount: {
    total: number;
    open: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface TaskItem {
  resourceType: 'Task';
  id: string;
  intent: string;
  status: 'requested' | 'completed' | 'cancelled' | 'in-progress' | 'draft';
  statusReason?: { text?: string };
  businessStatus?: { text?: 'high' | 'medium' | 'low' };
  owner?: { display?: 'Billing' | 'Doctor' | string };
  code?: { text?: string };
  description?: string;
  note?: Array<{ text: string; time?: string; authorString?: string }>;
  input?: Array<{ type: { text: string }; valueString?: string }>;
  output?: Array<{ type: { text: string }; valueString?: string }>;
  focus?: { reference?: string };
}

export interface EncounterDetail {
  encounter: any;
  patient: any;
  coverage: any;
  conditions: any[];
  charges: any[];
  documents: Array<{ id: string; title: string; text: string }>;
  tasks: TaskItem[];
  gate: ReadinessGate;
  totalInr: number;
}

export interface SystemStatus {
  activeBackend: 'local' | 'healthcare_api';
  backendLabel: string;
  geminiConfigured: boolean;
  geminiReason?: string;
  env: {
    project: string;
    location: string;
    geminiLocation?: string;
    fhirDataset: string;
    fhirStore: string;
    reviewModel: string;
    extractModel: string;
  };
}

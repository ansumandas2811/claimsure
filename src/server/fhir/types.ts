/**
 * Minimal FHIR R4 TypeScript definitions for ClaimSure
 */

export interface FhirResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
  };
  [key: string]: any;
}

export interface Patient extends FhirResource {
  resourceType: 'Patient';
  id: string;
  identifier?: Array<{ system?: string; value: string }>;
  name?: Array<{ use?: string; family?: string; given?: string[] }>;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
}

export interface Encounter extends FhirResource {
  resourceType: 'Encounter';
  id: string;
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled';
  class: { system?: string; code: string; display?: string };
  subject: { reference: string; display?: string };
  period?: { start: string; end?: string };
  hospitalization?: {
    admitSource?: { coding?: Array<{ code: string; display?: string }> };
    dischargeDisposition?: { coding?: Array<{ code: string; display?: string }> };
  };
}

export interface Coverage extends FhirResource {
  resourceType: 'Coverage';
  id: string;
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  beneficiary: { reference: string };
  payor: Array<{ reference?: string; display?: string }>;
  class?: Array<{ type: { coding: Array<{ code: string }> }; value: string; name?: string }>;
}

export interface Condition extends FhirResource {
  resourceType: 'Condition';
  id: string;
  clinicalStatus?: { coding: Array<{ code: string }> };
  verificationStatus?: { coding: Array<{ code: string }> };
  category?: Array<{ coding: Array<{ code: string }> }>;
  code: {
    coding?: Array<{ system?: string; code: string; display?: string }>;
    text?: string;
  };
  subject: { reference: string };
  encounter?: { reference: string };
}

export interface Procedure extends FhirResource {
  resourceType: 'Procedure';
  id: string;
  status: 'preparation' | 'in-progress' | 'not-done' | 'on-hold' | 'stopped' | 'completed' | 'entered-in-error' | 'unknown';
  code: {
    coding?: Array<{ system?: string; code: string; display?: string }>;
    text?: string;
  };
  subject: { reference: string };
  performedDateTime?: string;
  performedPeriod?: { start: string; end?: string };
}

export interface ChargeItem extends FhirResource {
  resourceType: 'ChargeItem';
  id: string;
  status: 'planned' | 'billable' | 'not-billable' | 'aborted' | 'billed' | 'entered-in-error' | 'unknown';
  code: {
    coding?: Array<{ system?: string; code: string; display?: string }>;
    text?: string;
  };
  subject: { reference: string };
  context?: { reference: string };
  occurrenceDateTime?: string;
  quantity?: { value: number };
  priceOverride?: { value: number; currency: string };
}

export interface DocumentReference extends FhirResource {
  resourceType: 'DocumentReference';
  id: string;
  status: 'current' | 'superseded' | 'entered-in-error';
  type?: { coding?: Array<{ code?: string; display?: string }>; text?: string };
  subject: { reference: string };
  description?: string;
  context?: {
    encounter?: Array<{ reference: string }>;
  };
  content: Array<{
    attachment: {
      contentType?: string;
      title?: string;
      data?: string; // base64
      url?: string;
    };
  }>;
}

export interface Task extends FhirResource {
  resourceType: 'Task';
  id: string;
  intent: 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  status: 'draft' | 'requested' | 'received' | 'accepted' | 'rejected' | 'ready' | 'cancelled' | 'in-progress' | 'on-hold' | 'failed' | 'completed' | 'entered-in-error';
  statusReason?: { text?: string };
  businessStatus?: { text?: string }; // severity: "high" | "medium" | "low"
  for: { reference: string };
  encounter?: { reference: string };
  focus?: { reference: string };
  owner?: { display: 'Billing' | 'Doctor' | string };
  code?: { text: string }; // check name
  description?: string; // explanation
  note?: Array<{ text: string; time?: string; authorString?: string }>;
  input?: Array<{ type: { text: string }; valueString?: string }>;
  output?: Array<{ type: { text: string }; valueString?: string }>;
}

export interface Claim extends FhirResource {
  resourceType: 'Claim';
  id: string;
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  type: { coding: Array<{ system?: string; code: string; display?: string }> };
  use: 'claim' | 'preauthorization' | 'predetermination';
  patient: { reference: string };
  created: string;
  provider: { display: string };
  priority: { coding: Array<{ system?: string; code: string; display?: string }> };
  insurance: Array<{
    sequence: number;
    focal: boolean;
    coverage: { reference: string };
  }>;
  diagnosis?: Array<{
    sequence: number;
    diagnosisCodeableConcept?: {
      coding: Array<{ system?: string; code: string; display?: string }>;
      text?: string;
    };
  }>;
  item?: Array<{
    sequence: number;
    productOrService: {
      coding?: Array<{ code: string; display?: string }>;
      text?: string;
    };
    quantity?: { value: number };
    unitPrice?: { value: number; currency: string };
    net?: { value: number; currency: string };
  }>;
  supportingInfo?: Array<{
    sequence: number;
    category: { coding: Array<{ system?: string; code: string; display?: string }> };
    valueReference?: { reference: string };
  }>;
  total?: { value: number; currency: string };
}

export interface Bundle extends FhirResource {
  resourceType: 'Bundle';
  id?: string;
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 'batch' | 'batch-response' | 'history' | 'searchset' | 'collection';
  entry?: Array<{
    fullUrl?: string;
    resource?: FhirResource;
    request?: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      url: string;
    };
  }>;
}

export type ReadinessGate = 'Blocked' | 'Needs review' | 'Ready';

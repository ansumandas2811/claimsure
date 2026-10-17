import fs from 'fs';
import path from 'path';
import { getFhirSource } from '../fhir/index.ts';
import { Bundle, ChargeItem, Condition, Coverage, Encounter, Patient } from '../fhir/types.ts';

function parseCsv(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',').map(h => h.trim());

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || '';
    });
    rows.push(obj);
  }
  return rows;
}

function parseMessyDate(str: string): string {
  if (!str) return new Date().toISOString();
  try {
    // Try standard Date parsing
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString();

    // Try DD/MM/YYYY or DD-MM-YYYY
    const parts = str.split(/[\/\-\.\s]/);
    if (parts.length >= 3) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      const p3 = parseInt(parts[2], 10);
      if (p3 > 1900) {
        // DD/MM/YYYY
        return new Date(Date.UTC(p3, p2 - 1, p1)).toISOString();
      }
    }
  } catch {}
  return new Date().toISOString();
}

function mapFreeTextDiagnosis(text: string): { code: string; display: string } {
  const lower = text.toLowerCase();
  if (lower.includes('gastroenteritis')) {
    return { code: 'A08.4', display: 'Viral intestinal infection, unspecified' };
  }
  if (lower.includes('asthma')) {
    return { code: 'J45.909', display: 'Unspecified asthma, uncomplicated' };
  }
  if (lower.includes('diabetes')) {
    return { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications' };
  }
  return { code: 'R69', display: text };
}

export function loadLegacyCsvData() {
  const legacyDir = path.resolve(process.cwd(), 'data', 'legacy');
  const admissionsPath = path.join(legacyDir, 'admissions.csv');
  const diagnosesPath = path.join(legacyDir, 'diagnoses.csv');
  const chargesPath = path.join(legacyDir, 'charges.csv');

  const admissionsRaw = fs.existsSync(admissionsPath) ? fs.readFileSync(admissionsPath, 'utf-8') : '';
  const diagnosesRaw = fs.existsSync(diagnosesPath) ? fs.readFileSync(diagnosesPath, 'utf-8') : '';
  const chargesRaw = fs.existsSync(chargesPath) ? fs.readFileSync(chargesPath, 'utf-8') : '';

  return {
    raw: {
      admissions: admissionsRaw,
      diagnoses: diagnosesRaw,
      charges: chargesRaw,
    },
    parsed: {
      admissions: parseCsv(admissionsRaw),
      diagnoses: parseCsv(diagnosesRaw),
      charges: parseCsv(chargesRaw),
    },
  };
}

export function convertLegacyToFhir(): Bundle {
  const data = loadLegacyCsvData();
  const entries: any[] = [];

  for (const adm of data.parsed.admissions) {
    const mrn = adm.mrn;
    const patId = `pat-legacy-${mrn.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const encId = `ENC-LEGACY-${mrn.replace('IN-HIS-', '')}`;

    const [given, family] = (adm.patient_name || 'Patient Unknown').split(' ');

    const patient: Patient = {
      resourceType: 'Patient',
      id: patId,
      identifier: [{ system: 'http://hospital.demo/mrn', value: mrn }],
      name: [{ use: 'official', family: family || '', given: [given || ''] }],
      gender: adm.gender === 'M' ? 'male' : 'female',
      birthDate: parseMessyDate(adm.dob).split('T')[0],
    };
    entries.push({ resource: patient, request: { method: 'POST', url: 'Patient' } });

    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: encId,
      status: 'finished',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: adm.ward_type || 'Inpatient' },
      subject: { reference: `Patient/${patId}`, display: adm.patient_name },
      period: {
        start: parseMessyDate(adm.admit_date),
        end: parseMessyDate(adm.discharge_date),
      },
    };
    entries.push({ resource: encounter, request: { method: 'POST', url: 'Encounter' } });

    const coverage: Coverage = {
      resourceType: 'Coverage',
      id: `cov-legacy-${mrn.toLowerCase()}`,
      status: 'active',
      beneficiary: { reference: `Patient/${patId}` },
      payor: [{ display: adm.insurance_payer || 'Navjeevan Demo TPA / Kavach Demo General Insurance' }],
      class: [{
        type: { coding: [{ code: 'plan' }] },
        value: 'Kavach Comprehensive Health Plan',
        name: 'Corporate Health Suraksha',
      }],
    };
    entries.push({ resource: coverage, request: { method: 'POST', url: 'Coverage' } });

    // Diagnoses for this MRN
    const mrnDiagnoses = data.parsed.diagnoses.filter(d => d.mrn === mrn);
    mrnDiagnoses.forEach((diag, idx) => {
      const mapped = mapFreeTextDiagnosis(diag.free_text_diagnosis);
      const cond: Condition = {
        resourceType: 'Condition',
        id: `cond-legacy-${mrn.toLowerCase()}-${idx + 1}`,
        clinicalStatus: { coding: [{ code: 'active' }] },
        verificationStatus: { coding: [{ code: 'confirmed' }] },
        category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
        code: {
          coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: mapped.code, display: mapped.display }],
          text: diag.free_text_diagnosis,
        },
        subject: { reference: `Patient/${patId}` },
        encounter: { reference: `Encounter/${encId}` },
      };
      entries.push({ resource: cond, request: { method: 'POST', url: 'Condition' } });
    });

    // Charges for this MRN
    const mrnCharges = data.parsed.charges.filter(c => c.mrn === mrn);
    mrnCharges.forEach((chg, idx) => {
      const qty = parseInt(chg.quantity, 10) || 1;
      const unitPrice = parseFloat(chg.unit_price_inr) || 0;
      const chargeItem: ChargeItem = {
        resourceType: 'ChargeItem',
        id: `charge-legacy-${mrn.toLowerCase()}-${idx + 1}`,
        status: 'billable',
        code: { coding: [{ code: 'LEGACY-FEE', display: chg.item_description }], text: chg.item_description },
        subject: { reference: `Patient/${patId}` },
        context: { reference: `Encounter/${encId}` },
        occurrenceDateTime: parseMessyDate(chg.service_date),
        quantity: { value: qty },
        priceOverride: { value: qty * unitPrice, currency: 'INR' },
      };
      entries.push({ resource: chargeItem, request: { method: 'POST', url: 'ChargeItem' } });
    });
  }

  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: entries,
  };
}

export async function commitLegacyToFhirStore(): Promise<{ importedEncounters: number; totalResources: number }> {
  const bundle = convertLegacyToFhir();
  const source = getFhirSource();
  await source.executeTransaction(bundle);

  const encountersCount = bundle.entry?.filter(e => e.resource?.resourceType === 'Encounter').length || 0;
  const totalCount = bundle.entry?.length || 0;

  return {
    importedEncounters: encountersCount,
    totalResources: totalCount,
  };
}

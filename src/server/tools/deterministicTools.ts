import fs from 'fs';
import path from 'path';
import { getFhirSource } from '../fhir/index.ts';
import { ChargeItem, DocumentReference } from '../fhir/types.ts';

/**
 * Tool 1: fhir_search(resourceType, params)
 */
export async function fhir_search(args: { resourceType: string; params?: Record<string, string> }) {
  const source = getFhirSource();
  const results = await source.search(args.resourceType, args.params || {});
  return {
    count: results.length,
    results: results.slice(0, 15), // prevent overflowing context
  };
}

/**
 * Tool 2: get_note_text(encounterId)
 */
export async function get_note_text(args: { encounterId: string }) {
  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(args.encounterId);
  if (!bundle || !bundle.entry) {
    return { error: `Encounter ${args.encounterId} not found` };
  }

  const docRefs = bundle.entry
    .map(e => e.resource)
    .filter((r): r is DocumentReference => r?.resourceType === 'DocumentReference');

  if (docRefs.length === 0) {
    return { note_text: '', source: null, message: 'No DocumentReference found for encounter' };
  }

  const doc = docRefs[0];
  let text = doc.description || '';

  if (doc.content && doc.content.length > 0 && doc.content[0].attachment) {
    const att = doc.content[0].attachment;
    if (att.data) {
      try {
        const decoded = Buffer.from(att.data, 'base64').toString('utf-8');
        if (decoded) text = decoded;
      } catch (err) {
        console.error('Failed to decode base64 attachment:', err);
      }
    }
  }

  return {
    source: `DocumentReference/${doc.id}`,
    title: doc.content?.[0]?.attachment?.title || doc.type?.text || 'Discharge Summary',
    note_text: text,
  };
}

/**
 * Tool 3: get_policy_clauses(topic)
 */
export async function get_policy_clauses(args: { topic?: string }) {
  const policyPath = path.resolve(process.cwd(), 'data', 'policy.txt');
  if (!fs.existsSync(policyPath)) {
    return { error: 'Policy file not found' };
  }

  const policyText = fs.readFileSync(policyPath, 'utf-8');
  if (!args.topic || args.topic === 'all') {
    return { source: 'Policy/Navjeevan-2026', clauses: policyText };
  }

  const query = args.topic.toLowerCase();
  const paragraphs = policyText.split(/\n(?=CLAUSE \d+:)/);
  const matching = paragraphs.filter(p => p.toLowerCase().includes(query));

  if (matching.length === 0) {
    // Return all if no specific match
    return { source: 'Policy/Navjeevan-2026', clauses: policyText };
  }

  return {
    source: 'Policy/Navjeevan-2026',
    clauses: matching.join('\n\n'),
  };
}

/**
 * Tool 4: lookup_diagnosis_code(code)
 */
export async function lookup_diagnosis_code(args: { code: string }) {
  const icdPath = path.resolve(process.cwd(), 'data', 'icd10_subset.json');
  if (!fs.existsSync(icdPath)) {
    return { error: 'ICD-10 reference dataset not found' };
  }

  const icdData = JSON.parse(fs.readFileSync(icdPath, 'utf-8'));
  const cleaned = args.code.trim().toUpperCase();

  if (icdData[cleaned]) {
    return { found: true, details: icdData[cleaned] };
  }

  return {
    found: false,
    message: `Diagnosis code ${args.code} not found in hospital primary billing registry`,
  };
}

/**
 * Tool 5: find_duplicate_charges(encounterId)
 */
export async function find_duplicate_charges(args: { encounterId: string }) {
  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(args.encounterId);
  if (!bundle || !bundle.entry) {
    return { duplicates: [], message: 'Encounter not found' };
  }

  const charges = bundle.entry
    .map(e => e.resource)
    .filter((r): r is ChargeItem => r?.resourceType === 'ChargeItem');

  const seen = new Map<string, ChargeItem[]>();
  for (const c of charges) {
    const codeKey = c.code?.coding?.[0]?.code || c.code?.text || 'unknown';
    const timestampKey = c.occurrenceDateTime || 'notime';
    const key = `${codeKey}_${timestampKey}`;

    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key)!.push(c);
  }

  const duplicates: Array<{
    code: string;
    description: string;
    count: number;
    amount_inr: number;
    charge_ids: string[];
  }> = [];

  for (const [key, items] of seen.entries()) {
    if (items.length > 1) {
      duplicates.push({
        code: items[0].code?.coding?.[0]?.code || items[0].code?.text || 'unknown',
        description: items[0].code?.coding?.[0]?.display || items[0].code?.text || 'Item',
        count: items.length,
        amount_inr: items[0].priceOverride?.value || 0,
        charge_ids: items.map(i => i.id),
      });
    }
  }

  return {
    has_duplicates: duplicates.length > 0,
    duplicates,
  };
}

/**
 * Tool 6: check_charge_totals(encounterId)
 */
export async function check_charge_totals(args: { encounterId: string }) {
  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(args.encounterId);
  if (!bundle || !bundle.entry) {
    return { error: 'Encounter not found' };
  }

  const charges = bundle.entry
    .map(e => e.resource)
    .filter((r): r is ChargeItem => r?.resourceType === 'ChargeItem');

  let grandTotal = 0;
  const lineItems: Array<{ id: string; code: string; display: string; qty: number; unitPrice: number; total: number }> = [];
  const roomCharges: Array<{ id: string; display: string; days: number; dailyRate: number; total: number }> = [];

  for (const c of charges) {
    const qty = c.quantity?.value || 1;
    const price = c.priceOverride?.value || 0;
    const lineTotal = price; // In seed, priceOverride is total or unit price * qty
    grandTotal += lineTotal;

    const display = c.code?.coding?.[0]?.display || c.code?.text || 'Charge';
    const code = c.code?.coding?.[0]?.code || '';

    lineItems.push({
      id: c.id,
      code,
      display,
      qty,
      unitPrice: qty > 0 ? Math.round(price / qty) : price,
      total: lineTotal,
    });

    if (code.includes('ROOM') || code.includes('ICU') || display.toLowerCase().includes('room') || display.toLowerCase().includes('bed') || display.toLowerCase().includes('icu')) {
      const dailyRate = qty > 0 ? Math.round(price / qty) : price;
      roomCharges.push({
        id: c.id,
        display,
        days: qty,
        dailyRate,
        total: lineTotal,
      });
    }
  }

  return {
    currency: 'INR',
    grand_total: grandTotal,
    items_count: lineItems.length,
    line_items: lineItems,
    room_charges: roomCharges,
  };
}

/**
 * Tool 7: check_required_documents(encounterId)
 */
export async function check_required_documents(args: { encounterId: string }) {
  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(args.encounterId);
  if (!bundle || !bundle.entry) {
    return { error: 'Encounter not found' };
  }

  const resources = bundle.entry
    .map(e => e.resource)
    .filter((r): r is NonNullable<typeof r> => r !== undefined && r !== null);
  const hasDischargeSummary = resources.some(r => r.resourceType === 'DocumentReference');
  const hasCharges = resources.some(r => r.resourceType === 'ChargeItem');
  const hasCoverage = resources.some(r => r.resourceType === 'Coverage');
  const hasCondition = resources.some(r => r.resourceType === 'Condition');
  const hasProcedure = resources.some(r => r.resourceType === 'Procedure');

  return {
    documents: {
      discharge_summary: hasDischargeSummary,
      itemized_charges: hasCharges,
      insurance_coverage: hasCoverage,
      diagnosis_coded: hasCondition,
      procedure_coded: hasProcedure,
    },
    all_present: hasDischargeSummary && hasCharges && hasCoverage && hasCondition,
  };
}

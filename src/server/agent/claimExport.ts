import { getFhirSource } from '../fhir/index.ts';
import { ChargeItem, Claim, Condition, Coverage, DocumentReference, Patient } from '../fhir/types.ts';

export async function generateFhirClaim(encounterId: string): Promise<Claim> {
  const source = getFhirSource();
  const bundle = await source.getEncounterBundle(encounterId);
  if (!bundle || !bundle.entry) {
    throw new Error(`Encounter ${encounterId} not found`);
  }

  const resources = bundle.entry.map(e => e.resource).filter(Boolean);
  const patient = resources.find((r): r is Patient => r?.resourceType === 'Patient');
  const coverage = resources.find((r): r is Coverage => r?.resourceType === 'Coverage');
  const conditions = resources.filter((r): r is Condition => r?.resourceType === 'Condition');
  const chargeItems = resources.filter((r): r is ChargeItem => r?.resourceType === 'ChargeItem');
  const docRefs = resources.filter((r): r is DocumentReference => r?.resourceType === 'DocumentReference');

  if (!patient) throw new Error('Patient resource missing for claim export');

  // Diagnosis mapping
  const diagnosisEntries = conditions.map((cond, idx) => ({
    sequence: idx + 1,
    diagnosisCodeableConcept: {
      coding: cond.code?.coding || [
        { system: 'http://hl7.org/fhir/sid/icd-10', code: 'R69', display: cond.code?.text || 'Illness' },
      ],
      text: cond.code?.text || cond.code?.coding?.[0]?.display || 'Primary Diagnosis',
    },
  }));

  // Item mapping from ChargeItem
  let grandTotal = 0;
  const items = chargeItems.map((ci, idx) => {
    const qty = ci.quantity?.value || 1;
    const price = ci.priceOverride?.value || 0;
    grandTotal += price;

    return {
      sequence: idx + 1,
      productOrService: {
        coding: ci.code?.coding || [{ code: 'SERVICE', display: ci.code?.text || 'Hospital Service' }],
        text: ci.code?.coding?.[0]?.display || ci.code?.text || 'Itemized Service',
      },
      quantity: { value: qty },
      unitPrice: { value: qty > 0 ? Math.round(price / qty) : price, currency: 'INR' },
      net: { value: price, currency: 'INR' },
    };
  });

  // SupportingInfo mapping from DocumentReference
  const supportingInfo = docRefs.map((doc, idx) => ({
    sequence: idx + 1,
    category: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claiminformationcategory', code: 'discharge-summary' }],
    },
    valueReference: { reference: `DocumentReference/${doc.id}` },
  }));

  const claim: Claim = {
    resourceType: 'Claim',
    id: `claim-${encounterId.toLowerCase()}`,
    status: 'active',
    type: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'institutional', display: 'Institutional' }],
    },
    use: 'claim',
    patient: { reference: `Patient/${patient.id}` },
    created: new Date().toISOString(),
    provider: { display: 'Demo Hospital' },
    priority: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal', display: 'Normal' }],
    },
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: { reference: `Coverage/${coverage?.id || 'cov-default'}` },
      },
    ],
    diagnosis: diagnosisEntries,
    item: items,
    supportingInfo,
    total: {
      value: grandTotal,
      currency: 'INR',
    },
  };

  return claim;
}

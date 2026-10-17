import { GoogleGenAI, Type } from '@google/genai';
import { isGeminiConfigured } from '../agent/reviewAgent.ts';
import { getFhirSource } from '../fhir/index.ts';
import { Bundle, ChargeItem, Condition, Encounter, Patient } from '../fhir/types.ts';

export async function extractDocumentMultimodal(
  base64Data: string,
  mimeType: string
): Promise<{ extractedBundle: Bundle; rawJson: any }> {
  const check = isGeminiConfigured();
  if (!check.configured) {
    throw new Error(check.reason || 'Gemini not configured: run gcloud auth application-default login');
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GEMINI_LOCATION || 'global';
  const extractModel = process.env.EXTRACT_MODEL || 'gemini-3.8-flash';

  const ai = new GoogleGenAI({
    vertexai: true,
    project,
    location,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `You are ClaimSure's clinical document and hospital invoice multimodal extractor.
Extract all clinical and billing data from this scanned hospital medical document/bill into structured FHIR-aligned data.
Return a valid JSON object matching the requested schema with patient information, inpatient encounter details, diagnosis condition, and itemized charges with amounts in Indian Rupees (INR).`;

  const response = await ai.models.generateContent({
    model: extractModel,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        { text: prompt },
      ],
    },
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          patientName: { type: Type.STRING, description: 'Patient full name' },
          mrn: { type: Type.STRING, description: 'Medical Record Number / ID' },
          gender: { type: Type.STRING, description: 'male or female' },
          admissionDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
          dischargeDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
          diagnosis: { type: Type.STRING, description: 'Primary diagnosis description' },
          icdCode: { type: Type.STRING, description: 'ICD-10 code if present, e.g. K80.20' },
          charges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                totalAmountInr: { type: Type.NUMBER },
              },
              required: ['description', 'totalAmountInr'],
            },
          },
        },
        required: ['patientName', 'charges'],
      },
    },
  });

  const parsed = JSON.parse(response.text?.trim() || '{}');
  const randSuffix = Math.random().toString(36).substring(2, 7);
  const patId = `pat-scan-${randSuffix}`;
  const encId = `ENC-SCAN-${randSuffix.toUpperCase()}`;

  const [given, ...familyParts] = (parsed.patientName || 'Extracted Patient').split(' ');

  const patient: Patient = {
    resourceType: 'Patient',
    id: patId,
    identifier: [{ system: 'http://hospital.demo/mrn', value: parsed.mrn || `MRN-SCAN-${randSuffix}` }],
    name: [{ use: 'official', family: familyParts.join(' ') || '', given: [given || ''] }],
    gender: (parsed.gender?.toLowerCase() === 'female' ? 'female' : 'male') as any,
  };

  const encounter: Encounter = {
    resourceType: 'Encounter',
    id: encId,
    status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'Inpatient Stay' },
    subject: { reference: `Patient/${patId}`, display: parsed.patientName },
    period: {
      start: parsed.admissionDate ? `${parsed.admissionDate}T09:00:00Z` : new Date().toISOString(),
      end: parsed.dischargeDate ? `${parsed.dischargeDate}T12:00:00Z` : new Date().toISOString(),
    },
  };

  const condition: Condition = {
    resourceType: 'Condition',
    id: `cond-scan-${randSuffix}`,
    clinicalStatus: { coding: [{ code: 'active' }] },
    verificationStatus: { coding: [{ code: 'confirmed' }] },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: parsed.icdCode || 'R69', display: parsed.diagnosis || 'Clinical Diagnosis' }],
      text: parsed.diagnosis || 'Extracted Clinical Diagnosis',
    },
    subject: { reference: `Patient/${patId}` },
    encounter: { reference: `Encounter/${encId}` },
  };

  const chargeEntries: any[] = (parsed.charges || []).map((chg: any, idx: number) => {
    const item: ChargeItem = {
      resourceType: 'ChargeItem',
      id: `charge-scan-${randSuffix}-${idx + 1}`,
      status: 'billable',
      code: { coding: [{ code: 'SCAN-FEE', display: chg.description }], text: chg.description },
      subject: { reference: `Patient/${patId}` },
      context: { reference: `Encounter/${encId}` },
      quantity: { value: chg.quantity || 1 },
      priceOverride: { value: chg.totalAmountInr || 0, currency: 'INR' },
    };
    return { resource: item, request: { method: 'POST', url: 'ChargeItem' } };
  });

  const bundle: Bundle = {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      { resource: patient, request: { method: 'POST', url: 'Patient' } },
      { resource: encounter, request: { method: 'POST', url: 'Encounter' } },
      { resource: condition, request: { method: 'POST', url: 'Condition' } },
      ...chargeEntries,
    ],
  };

  return { extractedBundle: bundle, rawJson: parsed };
}

export async function saveExtractedBundle(bundle: Bundle): Promise<void> {
  const source = getFhirSource();
  await source.executeTransaction(bundle);
}

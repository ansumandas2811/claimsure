import fs from 'fs';
import path from 'path';
import { getFhirSource } from '../fhir/index.ts';
import { Condition, DocumentReference, Procedure } from '../fhir/types.ts';

export interface AgentComment {
  check: string;
  severity: 'high' | 'medium' | 'low';
  assignee_role: 'billing' | 'doctor';
  focus: string; // e.g. "ChargeItem/charge-001-2" or "Condition/cond-002"
  explanation: string;
  evidence: {
    source: string; // e.g. "DocumentReference/docref-001" or "Policy/Clause-1"
    quote: string;
  };
  suggested_fix: {
    type: 'code_change' | 'doctor_note' | 'document_request' | 'charge_correction';
    draft: string;
  };
  verified?: boolean;
}

export function normalizeWhitespace(str: string): string {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Known clinical events, symptoms, and condition keywords to guard against fabrication.
 */
const CLINICAL_EVENT_KEYWORDS = [
  'bronchospasm',
  'desaturation',
  'desaturating',
  'desaturated',
  'hypoxia',
  'hypoxemia',
  'hypoxic',
  'cyanosis',
  'cyanotic',
  'hypotension',
  'hypotensive',
  'hypertensive crisis',
  'tachycardia',
  'tachycardic',
  'bradycardia',
  'bradycardic',
  'tachypnea',
  'tachypneic',
  'wheezing',
  'wheeze',
  'stridor',
  'arrhythmia',
  'fibrillation',
  'cardiac arrest',
  'respiratory arrest',
  'asystole',
  'shock',
  'sepsis',
  'septicemia',
  'intubation',
  'intubated',
  'mechanical ventilation',
  'ventilator',
  'inotropic',
  'inotropes',
  'vasopressor',
  'vasopressors',
  'noradrenaline',
  'norepinephrine',
  'dopamine',
  'dobutamine',
  'arterial line',
  'central venous line',
  'pneumothorax',
  'hemothorax',
  'pulmonary edema',
  'acidosis',
  'ketoacidosis',
  'alkalosis',
  'hemorrhage',
  'myocardial infarction',
  'angina',
  'stroke',
  'aspiration',
  'anaphylaxis',
  'unresponsive',
  'altered mental status',
  'coma',
];

/**
 * Code check: Reject any doctor_note draft containing clinical values or conditions
 * (vitals, SpO2, diagnoses, events) that do not appear in the encounter's source text.
 */
export function checkDoctorNoteDraft(
  encounterSourceText: string,
  draft: string
): { valid: boolean; rejectedReason?: string; detectedItem?: string } {
  if (!draft || !draft.trim()) {
    return { valid: false, rejectedReason: 'Draft note is empty' };
  }

  const normalizedSource = normalizeWhitespace(encounterSourceText);
  const normalizedDraft = normalizeWhitespace(draft);

  // 1. SpO2 and percentage values (e.g. 88%, SpO2 88)
  const spo2Matches = draft.match(/\b(?:spo2|o2\s*sat(?:uration)?|saturation)\s*[:=~]?\s*([<>]?\s*\d{1,3}%?)/gi) || [];
  for (const m of spo2Matches) {
    const normM = normalizeWhitespace(m);
    if (!normalizedSource.includes(normM)) {
      // Also check just the numeric percentage part
      const numMatch = m.match(/\d{1,3}%?/);
      if (numMatch && !normalizedSource.includes(numMatch[0])) {
        return {
          valid: false,
          rejectedReason: `Fabricated SpO2 / oxygen saturation value "${m}" not found in clinical source notes`,
          detectedItem: m,
        };
      }
    }
  }

  // Standalone percentage checks (e.g., "88%", "85%")
  const percentMatches = draft.match(/\b\d{1,3}%\b/g) || [];
  for (const p of percentMatches) {
    if (!normalizedSource.includes(p.toLowerCase())) {
      return {
        valid: false,
        rejectedReason: `Fabricated percentage/saturation value "${p}" not found in clinical source notes`,
        detectedItem: p,
      };
    }
  }

  // 2. Vital signs: Blood pressure (e.g. 120/80, 80/50, 90/60)
  const bpMatches = draft.match(/\b\d{2,3}\s*\/\s*\d{2,3}\b/g) || [];
  for (const bp of bpMatches) {
    const cleanBp = bp.replace(/\s+/g, '');
    const cleanSource = normalizedSource.replace(/\s+/g, '');
    if (!cleanSource.includes(cleanBp)) {
      return {
        valid: false,
        rejectedReason: `Fabricated blood pressure value "${bp}" not found in clinical source notes`,
        detectedItem: bp,
      };
    }
  }

  // Heart rate / pulse (e.g. "HR 120", "pulse 110", "130 bpm")
  const hrMatches = draft.match(/\b(?:hr|pulse|heart\s*rate)\s*[:=]?\s*(\d{2,3})\b/gi) || [];
  for (const hr of hrMatches) {
    const num = hr.match(/\d{2,3}/)?.[0];
    if (num && !normalizedSource.includes(num)) {
      return {
        valid: false,
        rejectedReason: `Fabricated heart rate value "${hr}" not found in clinical source notes`,
        detectedItem: hr,
      };
    }
  }

  // 3. Clinical acute conditions & events keywords
  for (const kw of CLINICAL_EVENT_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(normalizedDraft)) {
      if (!regex.test(normalizedSource)) {
        return {
          valid: false,
          rejectedReason: `Fabricated clinical event/condition "${kw}" not found in clinical source notes`,
          detectedItem: kw,
        };
      }
    }
  }

  // 4. ICD-10 diagnosis codes mentioned in draft (e.g., I21.9, K80.20, J45.9)
  const icdMatches = draft.match(/\b[A-Z]\d{2}(?:\.\d{1,3})?\b/gi) || [];
  for (const code of icdMatches) {
    const upperCode = code.toUpperCase();
    if (!encounterSourceText.toUpperCase().includes(upperCode)) {
      return {
        valid: false,
        rejectedReason: `Fabricated ICD-10 diagnosis code "${code}" not found in clinical source notes`,
        detectedItem: code,
      };
    }
  }

  return { valid: true };
}

/**
 * Programmatic verification step:
 * 1. Drops any comment whose evidence.quote does not appear verbatim in the cited source's text.
 * 2. REJECTS any doctor_note draft containing clinical values or conditions (vitals, SpO2, diagnoses, events)
 *    that do not appear in the encounter's source text, and logs the rejection.
 */
export async function verifyComment(encounterId: string, comment: AgentComment): Promise<{ verified: boolean; error?: string }> {
  if (!comment.evidence || !comment.evidence.quote) {
    return { verified: false, error: 'Comment lacks evidence quote' };
  }

  const quote = normalizeWhitespace(comment.evidence.quote);
  if (!quote || quote.length < 3) {
    return { verified: false, error: 'Quote too short or empty' };
  }

  const sourceRef = comment.evidence.source || '';
  const source = getFhirSource();

  // Load encounter bundle to gather all source text
  const bundle = await source.getEncounterBundle(encounterId);
  let allEncounterText = '';

  if (bundle && bundle.entry) {
    for (const entry of bundle.entry) {
      const res = entry.resource;
      if (!res) continue;

      if (res.resourceType === 'DocumentReference') {
        const doc = res as DocumentReference;
        if (doc.description) allEncounterText += ' ' + doc.description;
        if (doc.content?.[0]?.attachment?.data) {
          try {
            const decoded = Buffer.from(doc.content[0].attachment.data, 'base64').toString('utf-8');
            if (decoded) allEncounterText += ' ' + decoded;
          } catch {}
        }
      } else if (res.resourceType === 'Condition') {
        const cond = res as Condition;
        allEncounterText += ' ' + [cond.code?.text, cond.code?.coding?.[0]?.display, cond.code?.coding?.[0]?.code].filter(Boolean).join(' ');
      } else if (res.resourceType === 'Procedure') {
        const proc = res as Procedure;
        allEncounterText += ' ' + [proc.code?.text, proc.code?.coding?.[0]?.display, proc.code?.coding?.[0]?.code].filter(Boolean).join(' ');
      } else if (res.resourceType === 'ChargeItem') {
        allEncounterText += ' ' + [res.code?.text, res.code?.coding?.[0]?.display, res.code?.coding?.[0]?.code].filter(Boolean).join(' ');
      }
    }
  }

  // CRITICAL INTEGRITY CHECK 2:
  // If suggested fix is a doctor_note, check that it NEVER fabricates clinical facts
  if (comment.suggested_fix && comment.suggested_fix.type === 'doctor_note') {
    const draftCheck = checkDoctorNoteDraft(allEncounterText, comment.suggested_fix.draft);
    if (!draftCheck.valid) {
      console.warn(`[REJECTED doctor_note draft] ${draftCheck.rejectedReason}. Detected: "${draftCheck.detectedItem}". Draft: "${comment.suggested_fix.draft}"`);
      return {
        verified: false,
        error: `REJECTED doctor_note draft: ${draftCheck.rejectedReason}`,
      };
    }
  }

  // Verification of evidence quote against cited source
  // 1. If source is Policy
  if (sourceRef.toLowerCase().includes('policy')) {
    const policyPath = path.resolve(process.cwd(), 'data', 'policy.txt');
    if (fs.existsSync(policyPath)) {
      const policyContent = fs.readFileSync(policyPath, 'utf-8');
      const normalizedPolicy = normalizeWhitespace(policyContent);
      if (normalizedPolicy.includes(quote)) {
        return { verified: true };
      }
    }
  }

  // 2. Check DocumentReferences in bundle
  if (bundle && bundle.entry) {
    const docRefs = bundle.entry
      .map(e => e.resource)
      .filter((r): r is DocumentReference => r?.resourceType === 'DocumentReference');

    for (const doc of docRefs) {
      let docText = doc.description || '';
      if (doc.content?.[0]?.attachment?.data) {
        try {
          const decoded = Buffer.from(doc.content[0].attachment.data, 'base64').toString('utf-8');
          if (decoded) docText = decoded;
        } catch {}
      }

      const normalizedDoc = normalizeWhitespace(docText);
      if (normalizedDoc.includes(quote)) {
        return { verified: true };
      }
    }

    // 3. Check Condition or ChargeItem text if referenced
    for (const entry of bundle.entry) {
      const res = entry.resource;
      if (!res) continue;

      const resKey = `${res.resourceType}/${res.id}`;
      if (sourceRef.includes(resKey) || comment.focus.includes(resKey)) {
        const textToSearch = [
          res.description,
          res.code?.text,
          res.code?.coding?.[0]?.display,
          res.code?.coding?.[0]?.code,
        ].filter(Boolean).join(' ');

        if (normalizeWhitespace(textToSearch).includes(quote)) {
          return { verified: true };
        }
      }
    }
  }

  // Fallback: check policy text if not already checked
  const policyPath = path.resolve(process.cwd(), 'data', 'policy.txt');
  if (fs.existsSync(policyPath)) {
    const policyContent = fs.readFileSync(policyPath, 'utf-8');
    if (normalizeWhitespace(policyContent).includes(quote)) {
      return { verified: true };
    }
  }

  return {
    verified: false,
    error: `Evidence quote "${comment.evidence.quote.slice(0, 40)}..." was not found verbatim in ${sourceRef || 'clinical record'}`,
  };
}

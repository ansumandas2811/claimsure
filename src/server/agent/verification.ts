import fs from 'fs';
import path from 'path';
import { getFhirSource } from '../fhir/index.ts';
import { DocumentReference } from '../fhir/types.ts';

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
 * Programmatic verification step:
 * Drops any comment whose evidence.quote does not appear verbatim in the cited source's text.
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

  // 2. If source is DocumentReference or note
  const bundle = await source.getEncounterBundle(encounterId);
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
        } catch {
          // fallback to description
        }
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

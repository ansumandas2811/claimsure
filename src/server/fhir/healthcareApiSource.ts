import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { FhirSource } from './fhirSource.ts';
import { Bundle, FhirResource } from './types.ts';

export class HealthcareApiFhirSource implements FhirSource {
  readonly backendType = 'healthcare_api' as const;
  private auth: GoogleAuth;
  private baseUrl: string;
  private seedDir: string;

  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const project = process.env.GOOGLE_CLOUD_PROJECT || '';
    const location = process.env.GOOGLE_CLOUD_LOCATION || '';
    const dataset = process.env.FHIR_DATASET || '';
    const store = process.env.FHIR_STORE || '';

    this.baseUrl = `https://healthcare.googleapis.com/v1/projects/${project}/locations/${location}/datasets/${dataset}/fhirStores/${store}/fhir`;
    this.seedDir = path.resolve(process.cwd(), 'data', 'seed');
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) {
      throw new Error('Could not acquire Google Cloud Application Default Credentials (ADC) token. Please run `gcloud auth application-default login`.');
    }
    return {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/fhir+json; charset=utf-8',
      'Accept': 'application/fhir+json',
    };
  }

  async executeTransaction(bundle: Bundle): Promise<Bundle> {
    const headers = await this.getHeaders();
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(bundle),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud Healthcare API transaction failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<Bundle>;
  }

  async getEncounterBundle(encounterId: string): Promise<Bundle | null> {
    try {
      const encounter = await this.getResource('Encounter', encounterId);
      if (!encounter) return null;

      const patientRef = encounter.subject?.reference;
      const entries: Array<{ resource: FhirResource }> = [{ resource: encounter }];

      if (patientRef) {
        const patientId = patientRef.split('/')[1];
        const patient = await this.getResource('Patient', patientId);
        if (patient) entries.push({ resource: patient });
      }

      // Query related resources
      const relatedTypes = ['Condition', 'Procedure', 'ChargeItem', 'DocumentReference', 'Coverage', 'Task'];
      for (const type of relatedTypes) {
        const byEnc = await this.search(type, { encounter: encounterId });
        for (const res of byEnc) {
          if (!entries.some(e => e.resource?.resourceType === res.resourceType && e.resource?.id === res.id)) {
            entries.push({ resource: res });
          }
        }
      }

      return {
        resourceType: 'Bundle',
        type: 'searchset',
        entry: entries,
      };
    } catch (err: any) {
      console.error('Failed to get encounter bundle from Cloud Healthcare API:', err);
      throw new Error(`Cloud Healthcare API error: ${err.message || String(err)}`);
    }
  }

  private async getResource(type: string, id: string): Promise<FhirResource | null> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/${type}/${id}`, {
      method: 'GET',
      headers,
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Cloud Healthcare API GET ${type}/${id} error: ${errorText}`);
    }
    return res.json() as Promise<FhirResource>;
  }

  async search(type: string, params: Record<string, string>): Promise<FhirResource[]> {
    const headers = await this.getHeaders();
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}/${type}${query ? '?' + query : ''}`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud Healthcare API search ${type} failed (${response.status}): ${errorText}`);
    }

    const bundle = (await response.json()) as Bundle;
    if (!bundle.entry) return [];
    return bundle.entry.map(e => e.resource).filter(Boolean) as FhirResource[];
  }

  async create(resource: FhirResource): Promise<FhirResource> {
    const headers = await this.getHeaders();
    const url = `${this.baseUrl}/${resource.resourceType}`;
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud Healthcare API create ${resource.resourceType} failed: ${errorText}`);
    }

    return response.json() as Promise<FhirResource>;
  }

  async update(resource: FhirResource): Promise<FhirResource> {
    if (!resource.id) throw new Error('Cannot update resource without id');
    const headers = await this.getHeaders();
    const url = `${this.baseUrl}/${resource.resourceType}/${resource.id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloud Healthcare API update ${resource.resourceType}/${resource.id} failed: ${errorText}`);
    }

    return response.json() as Promise<FhirResource>;
  }

  async reset(): Promise<void> {
    if (!fs.existsSync(this.seedDir)) return;
    const seedFiles = fs.readdirSync(this.seedDir).filter(f => f.endsWith('.json')).sort();
    for (const file of seedFiles) {
      const content = fs.readFileSync(path.join(this.seedDir, file), 'utf-8');
      const bundle = JSON.parse(content) as Bundle;
      await this.executeTransaction(bundle);
    }
  }
}

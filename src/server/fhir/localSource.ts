import fs from 'fs';
import path from 'path';
import { FhirSource } from './fhirSource.ts';
import { Bundle, FhirResource, Task } from './types.ts';

export class LocalJsonFhirSource implements FhirSource {
  readonly backendType = 'local' as const;
  private resources: Map<string, FhirResource> = new Map();
  private fhirDir: string;
  private seedDir: string;

  constructor() {
    this.fhirDir = path.resolve(process.cwd(), 'data', 'fhir');
    this.seedDir = path.resolve(process.cwd(), 'data', 'seed');

    if (!fs.existsSync(this.fhirDir)) {
      fs.mkdirSync(this.fhirDir, { recursive: true });
    }

    this.initializeFromFiles();
  }

  private getKey(resourceType: string, id: string): string {
    return `${resourceType}/${id}`;
  }

  private initializeFromFiles(): void {
    // Check if there are already resources in data/fhir
    const files = fs.readdirSync(this.fhirDir).filter(f => f.endsWith('.json'));
    if (files.length > 0) {
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.fhirDir, file), 'utf-8');
          const res = JSON.parse(content) as FhirResource;
          if (res.resourceType && res.id) {
            this.resources.set(this.getKey(res.resourceType, res.id), res);
          }
        } catch (err) {
          console.error(`Error loading FHIR file ${file}:`, err);
        }
      }
    } else {
      // If empty, initialize from seed bundles
      this.resetSync();
    }
  }

  private resetSync(): void {
    this.resources.clear();

    if (!fs.existsSync(this.fhirDir)) {
      fs.mkdirSync(this.fhirDir, { recursive: true });
    } else {
      const existing = fs.readdirSync(this.fhirDir);
      for (const f of existing) {
        if (f.endsWith('.json')) {
          fs.unlinkSync(path.join(this.fhirDir, f));
        }
      }
    }

    if (fs.existsSync(this.seedDir)) {
      const seedFiles = fs.readdirSync(this.seedDir).filter(f => f.endsWith('.json')).sort();
      for (const seedFile of seedFiles) {
        try {
          const content = fs.readFileSync(path.join(this.seedDir, seedFile), 'utf-8');
          const bundle = JSON.parse(content) as Bundle;
          this.executeTransactionSync(bundle);
        } catch (err) {
          console.error(`Error loading seed file ${seedFile}:`, err);
        }
      }
    }
  }

  private executeTransactionSync(bundle: Bundle): Bundle {
    const responseEntries: Array<{ resource?: FhirResource }> = [];

    if (bundle.entry) {
      for (const entry of bundle.entry) {
        if (entry.resource) {
          const res = entry.resource;
          if (!res.id) {
            res.id = 'gen-' + Math.random().toString(36).substring(2, 9);
          }
          const key = this.getKey(res.resourceType, res.id);
          this.resources.set(key, res);
          this.saveToFile(res);
          responseEntries.push({ resource: res });
        }
      }
    }

    return {
      resourceType: 'Bundle',
      type: 'transaction-response',
      entry: responseEntries,
    };
  }

  private saveToFile(res: FhirResource): void {
    try {
      const filePath = path.join(this.fhirDir, `${res.resourceType}_${res.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(res, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Failed to write resource ${res.resourceType}/${res.id} to file:`, err);
    }
  }

  async reset(): Promise<void> {
    this.resetSync();
  }

  async executeTransaction(bundle: Bundle): Promise<Bundle> {
    return this.executeTransactionSync(bundle);
  }

  async getEncounterBundle(encounterId: string): Promise<Bundle | null> {
    const encounter = this.resources.get(`Encounter/${encounterId}`);
    if (!encounter) {
      return null;
    }

    const patientRef = encounter.subject?.reference; // e.g. "Patient/pat-001"
    const patientId = patientRef?.split('/')[1];

    const entries: Array<{ resource: FhirResource }> = [{ resource: encounter }];

    // Patient
    if (patientRef && this.resources.has(patientRef)) {
      entries.push({ resource: this.resources.get(patientRef)! });
    }

    // Related resources
    for (const res of this.resources.values()) {
      if (res.resourceType === 'Encounter' && res.id === encounterId) continue;
      if (res.resourceType === 'Patient' && res.id === patientId) continue;

      let matches = false;

      // Encounter context reference
      if (res.context?.reference === `Encounter/${encounterId}`) matches = true;
      if (res.encounter?.reference === `Encounter/${encounterId}`) matches = true;
      if (res.context?.encounter?.some((e: any) => e.reference === `Encounter/${encounterId}`)) matches = true;

      // Subject reference match
      if (patientRef && res.subject?.reference === patientRef) {
        if (['Condition', 'Procedure', 'ChargeItem', 'DocumentReference', 'Coverage', 'Task'].includes(res.resourceType)) {
          matches = true;
        }
      }

      // Coverage beneficiary match
      if (res.resourceType === 'Coverage' && patientRef && res.beneficiary?.reference === patientRef) {
        matches = true;
      }

      // Task for Encounter or Patient
      if (res.resourceType === 'Task') {
        const task = res as Task;
        if (task.encounter?.reference === `Encounter/${encounterId}` || task.for?.reference === patientRef) {
          matches = true;
        }
      }

      if (matches) {
        entries.push({ resource: res });
      }
    }

    return {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: entries,
    };
  }

  async search(type: string, params: Record<string, string>): Promise<FhirResource[]> {
    const results: FhirResource[] = [];

    for (const res of this.resources.values()) {
      if (res.resourceType !== type) continue;

      let match = true;
      for (const [key, value] of Object.entries(params)) {
        if (key === '_id' && res.id !== value) {
          match = false;
          break;
        }
        if (key === 'patient' || key === 'subject') {
          const ref = res.subject?.reference || res.patient?.reference || res.for?.reference;
          if (ref !== value && ref !== `Patient/${value}`) {
            match = false;
            break;
          }
        }
        if (key === 'encounter') {
          const ref = res.encounter?.reference || res.context?.reference;
          const encMatches = ref === value || ref === `Encounter/${value}` ||
            res.context?.encounter?.some((e: any) => e.reference === value || e.reference === `Encounter/${value}`);
          if (!encMatches) {
            match = false;
            break;
          }
        }
        if (key === 'status' && res.status !== value) {
          match = false;
          break;
        }
        if (key === 'code') {
          const hasCode = res.code?.coding?.some((c: any) => c.code === value) || res.code?.text?.includes(value);
          if (!hasCode) {
            match = false;
            break;
          }
        }
      }

      if (match) {
        results.push(res);
      }
    }

    return results;
  }

  async create(resource: FhirResource): Promise<FhirResource> {
    if (!resource.id) {
      resource.id = 'res-' + Math.random().toString(36).substring(2, 9);
    }
    const key = this.getKey(resource.resourceType, resource.id);
    this.resources.set(key, resource);
    this.saveToFile(resource);
    return resource;
  }

  async update(resource: FhirResource): Promise<FhirResource> {
    if (!resource.id) {
      throw new Error(`Cannot update resource without id: ${resource.resourceType}`);
    }
    const key = this.getKey(resource.resourceType, resource.id);
    this.resources.set(key, resource);
    this.saveToFile(resource);
    return resource;
  }
}

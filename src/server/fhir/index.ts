import { FhirSource } from './fhirSource.ts';
import { HealthcareApiFhirSource } from './healthcareApiSource.ts';
import { LocalJsonFhirSource } from './localSource.ts';

let activeFhirSource: FhirSource | null = null;

export function getFhirSource(): FhirSource {
  if (!activeFhirSource) {
    const backend = process.env.FHIR_BACKEND || 'local';
    if (backend === 'healthcare_api') {
      try {
        activeFhirSource = new HealthcareApiFhirSource();
      } catch (err) {
        console.warn('Failed to initialize HealthcareApiFhirSource, falling back to LocalJsonFhirSource:', err);
        activeFhirSource = new LocalJsonFhirSource();
      }
    } else {
      activeFhirSource = new LocalJsonFhirSource();
    }
  }
  return activeFhirSource;
}

export function setFhirSourceBackend(type: 'local' | 'healthcare_api'): FhirSource {
  if (type === 'healthcare_api') {
    activeFhirSource = new HealthcareApiFhirSource();
  } else {
    activeFhirSource = new LocalJsonFhirSource();
  }
  return activeFhirSource;
}

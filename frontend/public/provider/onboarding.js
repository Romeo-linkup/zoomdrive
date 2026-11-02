// provider/onboarding.js
import { getSession } from '../shared/auth.js';

export const DOC_LABELS = {
  id_document: 'ID document',
  drivers_licence: 'Driver\'s licence',
  vehicle_insurance: 'Vehicle and insurance',
  company_registration: 'Company registration certificate',
};

export const ONBOARDING_ROUTES = ['/type', '/profile-setup', '/documents', '/pending'];

export function requiredDocs(providerType) {
  const base = ['id_document', 'drivers_licence', 'vehicle_insurance'];
  if (providerType === 'company') {
    return [...base, 'company_registration'];
  }
  return base;
}

export function profileGaps(session) {
  const gaps = [];
  if (!session || !session.profile) return gaps;
  const p = session.profile;
  if (!p.providerType) gaps.push('Choose your provider type');
  if (!p.vehicleDescription) gaps.push('Vehicle description');
  if (!p.plate) gaps.push('Number plate');
  if (p.baseLat === null || p.baseLng === null) gaps.push('Base location');
  if (!p.serviceRadiusKm) gaps.push('Service radius');
  if (!p.serviceIds || p.serviceIds.length === 0) gaps.push('Choose at least one service');
  if (p.providerType === 'company') {
    if (!p.organisation || !p.organisation.name) gaps.push('Company name');
    if (!p.organisation || !p.organisation.regNumber) gaps.push('Registration number');
  }
  return gaps;
}

export function missingDocs(session) {
  const missing = [];
  if (!session || !session.profile) return missing;
  const p = session.profile;
  const required = requiredDocs(p.providerType || 'individual');
  if (!p.documents) return required;
  const uploaded = p.documents.map(d => d.docType);
  required.forEach(dt => {
    if (!uploaded.includes(dt)) {
      missing.push(DOC_LABELS[dt] || dt);
    }
  });
  return missing;
}

export function onboardingRoute(session) {
  if (!session || !session.profile) return '/type';
  const p = session.profile;
  const status = session.providerStatus;
  if (status === 'approved') return '/home';
  if (status === 'pending' || status === 'rejected') return '/pending';
  if (!p.providerType) return '/type';
  if (profileGaps(session).length > 0) return '/profile-setup';
  if (missingDocs(session).length > 0) return '/documents';
  return '/home';
}

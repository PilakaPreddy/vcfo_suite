import type { ServiceConfig } from '@/lib/dev/types';

/**
 * The firm-facing integrations on Firm settings (P-241), from the developer console's service
 * list. Only the services a partner cares about are listed, and only words go to the browser:
 * the env var names stay in the developer console.
 */
export type IntegrationStatus = 'Connected' | 'Needs set-up' | 'Not set up';

export interface FirmIntegration {
  id: ServiceConfig['id'];
  name: string;
  provider: string;
  what: string;
  status: IntegrationStatus;
}

const FIRM_FACING: ServiceConfig['id'][] = ['email', 'outlook', 'whatsapp', 'storage', 'jobs', 'ask'];

function integrationStatus(status: ServiceConfig['status']): IntegrationStatus {
  if (status === 'configured') return 'Connected';
  if (status === 'partial') return 'Needs set-up';
  return 'Not set up';
}

export function firmIntegrations(services: ServiceConfig[]): FirmIntegration[] {
  return FIRM_FACING.flatMap((id) => {
    const s = services.find((x) => x.id === id);
    if (!s) return [];
    return [{ id: s.id, name: s.name, provider: s.provider, what: s.what, status: integrationStatus(s.status) }];
  });
}

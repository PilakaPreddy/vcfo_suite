import { defineConfig } from 'wxt';

/**
 * WXT build for VCFO Assist Agents.
 *
 * The permission list is deliberately short (SAFETY.md, "Supporting controls"): sidePanel,
 * scripting and storage, plus host access for the Suite origins, the local mock portal and the
 * MCA portal. `src/manifest.test.ts` fails if another permission or host appears.
 */
export const PERMISSIONS = ['sidePanel', 'scripting', 'storage'];
export const HOST_PERMISSIONS = [
  'http://localhost/*',
  'http://127.0.0.1/*',
  'https://app.sbctrack.in/*',
  'https://*.mca.gov.in/*',
];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: {
    name: 'VCFO Assist Agents',
    description:
      'Fills government portal forms from VCFO Suite data. Stops at login, DSC, Submit and Pay, which the user does.',
    permissions: PERMISSIONS,
    host_permissions: HOST_PERMISSIONS,
    action: { default_title: 'Open VCFO Assist' },
  },
});

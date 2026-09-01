import type { SettingsService } from '@/services/contracts';
import type { InstitutionSettings } from '@/types';

import { request } from './client';

export const settingsApi: SettingsService = {
  getInstitutionSettings: () => request<InstitutionSettings>('settings/institution'),

  updateInstitutionSettings: (payload) =>
    request<InstitutionSettings>('settings/institution', {
      method: 'PATCH',
      body: payload,
    }),
};

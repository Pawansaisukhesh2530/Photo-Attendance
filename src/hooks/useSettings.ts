import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

import { settingsService } from '@/services';
import { queryKeys } from '@/store/queryClient';
import type { InstitutionSettings, UpdateSettingsRequest } from '@/types';

/**
 * Institution settings.
 *
 * The attendance threshold lives here. Any surface that flags a student should prefer the value the
 * server reports — `AttendanceReport.threshold` for reports, or these settings for admin
 * configuration — over the `ATTENDANCE_THRESHOLD` constant, which is only a client-side default.
 */
export function useInstitutionSettings(): UseQueryResult<InstitutionSettings> {
  return useQuery({
    queryKey: queryKeys.settings.institution,
    queryFn: () => settingsService.getInstitutionSettings(),
  });
}

export function useUpdateSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (request: UpdateSettingsRequest) =>
      settingsService.updateInstitutionSettings(request),
    onSuccess: (updated) => {
      // Write through, so the form reflects the saved value without a second round trip.
      client.setQueryData(queryKeys.settings.institution, updated);

      /*
       * Changing the threshold retroactively changes who counts as low-attendance everywhere, so
       * every report must be refetched rather than left showing figures computed against the old
       * policy. Audit is invalidated because the change is itself an audited event.
       */
      void client.invalidateQueries({ queryKey: queryKeys.reports.all });
      void client.invalidateQueries({ queryKey: queryKeys.audit.all });
    },
  });
}

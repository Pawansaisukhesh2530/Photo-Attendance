import { router, useLocalSearchParams } from 'expo-router';

import { AdminScaffold, StudentProfileView, useStudentHeaderTitle } from '@/components';
import { useInstitutionSettings } from '@/hooks/useSettings';

/**
 * Student profile, admin side.
 *
 * The body is `StudentProfileView`, exactly the component the faculty route renders — not a copy.
 * An administrator and a lecturer looking at the same student must see the same figures, the same
 * per-class breakdown and the same face-enrolment status, and one implementation is the only way to
 * guarantee that.
 *
 * The only difference is the chrome: `AdminScaffold` supplies the sidebar and breadcrumbs on desktop
 * where the faculty route uses `AppHeader`.
 *
 * Face enrolment remains display-only here. Admin can see whether a template exists and nothing
 * more — no capture, no biometric data, same as everywhere else in the app.
 */
export default function AdminStudentProfileScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { title, subtitle } = useStudentHeaderTitle(studentId);
  const { data: settings } = useInstitutionSettings();

  return (
    <AdminScaffold
      active="students"
      title={title}
      {...(subtitle ? { subtitle } : {})}
      breadcrumbs={[
        { label: 'Administration', href: '/(admin)/dashboard' },
        { label: 'Students', href: '/(admin)/students' },
        { label: title },
      ]}
      onBack={() => router.back()}
      {...(settings
        ? {
            institutionName: settings.institutionName,
            institutionCode: settings.institutionCode,
          }
        : {})}
    >
      <StudentProfileView
        studentId={studentId}
        onNotFoundAction={() => router.back()}
        notFoundActionLabel="Back to students"
      />
    </AdminScaffold>
  );
}

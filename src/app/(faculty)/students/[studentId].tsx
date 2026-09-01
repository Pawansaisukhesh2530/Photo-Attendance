import { router, useLocalSearchParams } from 'expo-router';

import { AppHeader, StudentProfileView, useStudentHeaderTitle } from '@/components';

/**
 * Student profile, faculty side.
 *
 * The body lives in `StudentProfileView`, shared with the admin route. Only the chrome differs:
 * faculty gets the standard `AppHeader`; admin gets the scaffold with its sidebar and breadcrumbs.
 * Sharing the body means the figures a lecturer sees and the figures an administrator sees can
 * never diverge.
 */
export default function StudentProfileScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { title, subtitle } = useStudentHeaderTitle(studentId);

  return (
    <StudentProfileView
      studentId={studentId}
      header={
        <AppHeader
          title={title}
          {...(subtitle ? { subtitle } : {})}
          onBack={() => router.back()}
        />
      }
      onNotFoundAction={() => router.back()}
      notFoundActionLabel="Back to students"
    />
  );
}

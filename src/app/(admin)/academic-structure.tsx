import { useQuery } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { AdminScaffold, Card, Icon, Screen, SectionHeader, Text } from '@/components';
import { request } from '@/api/client';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, spacing } from '@/theme';

type RecordItem = { id: string; code: string; name: string; active: boolean; [key: string]: unknown };
type AcademicTree = Record<'schools' | 'departments' | 'programs' | 'batches' | 'sections' | 'subjects', RecordItem[]>;

export default function AcademicStructureScreen() {
  const { data: settings } = useInstitutionSettings();
  const tree = useQuery({
    queryKey: ['academic', 'tree'],
    queryFn: () => request<AcademicTree>('academic/tree'),
  });
  const groups: [keyof AcademicTree, string, string][] = [
    ['schools', 'Schools', 'Top-level institution divisions'],
    ['departments', 'Departments', 'Belong to a school'],
    ['programs', 'Programmes', 'Belong to a department'],
    ['batches', 'Batches', 'Belong to a programme'],
    ['sections', 'Sections', 'Belong to a batch'],
    ['subjects', 'Subjects', 'Linked to programmes'],
  ];
  return (
    <AdminScaffold active="more" title="Academic structure" subtitle="Admin-managed hierarchy" {...(settings ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode } : {})}>
      <Screen scrollable>
        <View style={styles.intro}><Icon name="classes" size={24} color={palette.primary} /><Text variant="bodyLg" color={palette.onSurface}>Schools → Departments → Programmes → Batches → Sections</Text><Text variant="bodyMd" color={palette.onSurfaceVariant}>Classes, students and faculty will use these records through validated dropdowns.</Text></View>
        {groups.map(([key, title, description]) => (
          <View key={key} style={styles.group}><SectionHeader title={title} divider /><Text variant="labelMd" color={palette.onSurfaceVariant}>{description}</Text><Card padded={false}>{tree.data?.[key]?.length ? tree.data[key].map((item) => <View key={item.id} style={styles.row}><View style={styles.code}><Text variant="labelMd" color={palette.primary}>{item.code}</Text></View><Text variant="bodyLg" color={palette.onSurface}>{item.name}</Text></View>) : <Text variant="bodyMd" color={palette.onSurfaceVariant} style={styles.empty}>{tree.isLoading ? 'Loading…' : 'No records yet'}</Text>}</Card></View>
        ))}
        {tree.error ? <Text variant="bodyMd" color={palette.error}>Could not load academic structure.</Text> : null}
        <Text variant="labelMd" color={palette.onSurfaceVariant} style={styles.note}>Use the Academic Structure API to create, edit, archive and link records. Archived values are excluded from active hierarchy results.</Text>
      </Screen>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.md },
  group: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.outlineVariant },
  code: { minWidth: 84 },
  empty: { padding: spacing.md },
  note: { marginVertical: spacing.lg },
});

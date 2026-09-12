import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminScaffold, AnimatedPressable, Button, Card, CurriculumPanel, FilterChips, Icon, Screen, SearchField, SectionHeader, Text } from '@/components';
import { useAcademicLevel } from '@/hooks/useAcademic';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing } from '@/theme';

export default function CurriculumScreen() {
  const { programId, q = '', status = 'ACTIVE' } = useLocalSearchParams<{ programId?: string; q?: string; status?: string }>();
  const { data: settings } = useInstitutionSettings();
  const archived=status==='ARCHIVED';
  const subjects = useAcademicLevel('subjects', { pageSize: 100, search:q.trim()||undefined, active:!archived });
  return (
    <AdminScaffold active="curriculum" title="Curriculum" subtitle="Reusable subjects and programme assignments" {...(settings ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode } : {})} action={<Button label="New subject" icon="add" size="sm" onPress={() => router.push('/(admin)/academic-structure?kind=subjects&create=1' as never)} />}>
      <Screen scrollable contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionHeader title="Subject catalogue" meta={`${subjects.data?.total ?? 0} subjects`} divider />
          <SearchField value={q} onChangeText={(value)=>router.setParams({q:value})} placeholder="Search subject name or code" />
          <FilterChips options={[{value:'ACTIVE',label:'Active'},{value:'ARCHIVED',label:'Archived'}]} selected={archived?'ARCHIVED':'ACTIVE'} onSelect={(value)=>router.setParams({status:value})} />
          <Card padded={false}>
            {subjects.data?.items.length ? subjects.data.items.map((subject, index) => (
              <AnimatedPressable key={subject.id} onPress={() => router.push({ pathname: '/(admin)/academic-structure', params: { kind: 'subjects', selected: subject.id } })} style={[styles.subject, index < subjects.data.items.length - 1 && styles.divider]}>
                <View style={styles.subjectIcon}><Icon name="reports" color={palette.primary} /></View>
                <View style={styles.flex}><Text variant="bodyLg" color={palette.onSurface}>{subject.name}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{subject.code} · {subject.counts?.programmes ?? 0} programmes · {subject.counts?.classes ?? 0} classes</Text></View>
                <Icon name="chevronRight" color={palette.outline} />
              </AnimatedPressable>
            )) : <Text color={palette.onSurfaceVariant} style={styles.empty}>{archived?'No archived subjects match.':'No active subjects match.'}</Text>}
          </Card>
        </View>
        <View style={styles.section}><SectionHeader title="Programme curriculum" divider /><CurriculumPanel initialProgramId={programId ?? ''} /></View>
      </Screen>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({ content:{maxWidth:980,width:'100%',alignSelf:'center',gap:spacing.xl,paddingBottom:spacing.xxl}, section:{gap:spacing.sm}, subject:{flexDirection:'row',alignItems:'center',gap:spacing.sm,padding:spacing.md}, divider:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.outlineVariant}, subjectIcon:{width:40,height:40,borderRadius:radius.full,alignItems:'center',justifyContent:'center',backgroundColor:palette.primaryFixed}, flex:{flex:1,gap:2}, empty:{padding:spacing.lg} });

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminScaffold, AnimatedPressable, Card, Icon, Screen, SectionHeader, Text } from '@/components';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, touch } from '@/theme';

const destinations = [
  { label: 'Students', description: 'Manage student records, placement and face enrolment', icon: 'students' as const, href: '/(admin)/students' },
  { label: 'Faculty', description: 'Manage faculty records, status and class assignments', icon: 'faculty' as const, href: '/(admin)/faculty' },
];

export default function PeopleHubScreen() {
  const { data: settings } = useInstitutionSettings();
  return (
    <AdminScaffold active="people" title="People" subtitle="Students and faculty" {...(settings ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode } : {})}>
      <Screen scrollable>
        <SectionHeader title="Directories" divider />
        <Card padded={false}>
          {destinations.map((item, index) => (
            <AnimatedPressable key={item.label} onPress={() => router.push(item.href as never)} accessibilityRole="link" style={[styles.row, index === 0 && styles.divider]}>
              <View style={styles.icon}><Icon name={item.icon} color={palette.primary} /></View>
              <View style={styles.text}><Text variant="bodyLg" color={palette.onSurface}>{item.label}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{item.description}</Text></View>
              <Icon name="chevronRight" color={palette.outline} />
            </AnimatedPressable>
          ))}
        </Card>
      </Screen>
    </AdminScaffold>
  );
}

const styles = StyleSheet.create({ row:{minHeight:touch.large,flexDirection:'row',alignItems:'center',gap:spacing.sm,padding:spacing.md}, divider:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.outlineVariant}, icon:{width:42,height:42,borderRadius:radius.full,alignItems:'center',justifyContent:'center',backgroundColor:palette.primaryFixed}, text:{flex:1,gap:2} });

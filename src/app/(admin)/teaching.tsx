import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminScaffold, AnimatedPressable, Card, Icon, Screen, SectionHeader, Text } from '@/components';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing, touch } from '@/theme';

const destinations = [
  { label: 'Classes', description: 'Class catalogue, rosters and faculty assignments', icon: 'classes' as const, href: '/(admin)/classes' },
  { label: 'Timetable', description: 'Weekly teaching schedule and room allocation', icon: 'calendar' as const, href: '/(admin)/timetable' },
  { label: 'Attendance', description: 'Read-only attendance sessions and review state', icon: 'attendance' as const, href: '/(admin)/attendance' },
];

export default function TeachingHubScreen() {
  const { data: settings } = useInstitutionSettings();
  return (
    <AdminScaffold active="teaching" title="Teaching" subtitle="Classes, timetable and attendance" {...(settings ? { institutionName: settings.institutionName, institutionCode: settings.institutionCode } : {})}>
      <Screen scrollable>
        <SectionHeader title="Teaching operations" divider />
        <Card padded={false}>
          {destinations.map((item, index) => (
            <AnimatedPressable key={item.label} onPress={() => router.push(item.href as never)} accessibilityRole="link" style={[styles.row, index < destinations.length - 1 && styles.divider]}>
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

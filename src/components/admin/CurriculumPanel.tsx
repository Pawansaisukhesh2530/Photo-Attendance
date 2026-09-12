import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAcademicTree, useLinkProgramSubject, useUnlinkProgramSubject } from '@/hooks/useAcademic';
import { palette, spacing } from '@/theme';

import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { ConfirmationModal } from '../primitives/ConfirmationModal';
import { Input } from '../primitives/Input';
import { Text } from '../primitives/Text';
import { SelectionSheet } from './SelectionSheet';

export function CurriculumPanel({ initialProgramId = '' }: { initialProgramId?: string }) {
  const tree = useAcademicTree();
  const link = useLinkProgramSubject();
  const unlink = useUnlinkProgramSubject();
  const [programId, setProgramId] = useState(initialProgramId);
  const [subjectId, setSubjectId] = useState('');
  const [semester, setSemester] = useState('');
  const [picker, setPicker] = useState<'programs' | 'subjects' | null>(null);
  const [remove, setRemove] = useState<{ programId: string; subjectId: string } | null>(null);

  const options = useMemo(() => {
    const items = picker ? tree.data?.[picker] : [];
    return (items ?? []).filter((item) => item.active).map((item) => ({
      id: item.id,
      label: item.name,
      description: item.code,
      selected: item.id === (picker === 'programs' ? programId : subjectId),
    }));
  }, [picker, programId, subjectId, tree.data]);
  const assignments = (tree.data?.programSubjects ?? []).filter(
    (assignment) => !programId || assignment.programId === programId,
  );

  return (
    <View style={styles.block}>
      <Card style={styles.form}>
        <Text variant="titleLg" color={palette.onSurface}>Assign an existing subject</Text>
        <Text color={palette.onSurfaceVariant}>Subjects stay reusable; this assigns one to a programme and optional semester.</Text>
        <Button label={tree.data?.programs.find((item) => item.id === programId)?.name ?? 'Select programme'} variant="secondary" fullWidth onPress={() => setPicker('programs')} />
        <Button label={tree.data?.subjects.find((item) => item.id === subjectId)?.name ?? 'Select subject'} variant="secondary" fullWidth onPress={() => setPicker('subjects')} />
        <Input label="Semester (optional)" value={semester} onChangeText={setSemester} keyboardType="number-pad" />
        <Button label="Assign subject" disabled={!programId || !subjectId} loading={link.isPending} onPress={() => void link.mutateAsync({ programId, subjectId, ...(semester ? { semesterNumber: Number(semester) } : {}) }).then(() => { setSubjectId(''); setSemester(''); })} />
      </Card>
      <Card padded={false}>
        {assignments.length ? assignments.map((row) => (
          <View key={row.id} style={styles.row}>
            <View style={styles.flex}>
              <Text variant="bodyLg" color={palette.onSurface}>{tree.data?.subjects.find((item) => item.id === row.subjectId)?.name ?? row.subjectId}</Text>
              <Text variant="labelMd" color={palette.onSurfaceVariant}>{tree.data?.programs.find((item) => item.id === row.programId)?.name ?? row.programId}{row.semesterNumber ? ` · Semester ${row.semesterNumber}` : ''}</Text>
            </View>
            <Button label="Remove" size="sm" variant="ghost" onPress={() => setRemove(row)} />
          </View>
        )) : <Text style={styles.empty} color={palette.onSurfaceVariant}>No programme subjects match this view.</Text>}
      </Card>
      <SelectionSheet visible={picker !== null} title={`Choose ${picker === 'programs' ? 'programme' : 'subject'}`} options={options} searchable onSelect={(id) => { if (picker === 'programs') setProgramId(id); else setSubjectId(id); setPicker(null); }} onClose={() => setPicker(null)} />
      <ConfirmationModal visible={Boolean(remove)} title="Remove subject assignment?" message="Existing class offerings are protected and will block an unsafe removal." confirmLabel="Remove" tone="warning" confirmLoading={unlink.isPending} onCancel={() => setRemove(null)} onConfirm={() => { if (remove) void unlink.mutateAsync(remove).then(() => setRemove(null)); }} />
    </View>
  );
}

const styles = StyleSheet.create({ block:{gap:spacing.md}, form:{gap:spacing.md}, row:{flexDirection:'row',alignItems:'center',gap:spacing.sm,padding:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.outlineVariant}, flex:{flex:1,gap:2}, empty:{padding:spacing.md} });

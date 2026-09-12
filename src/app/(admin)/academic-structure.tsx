import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isApiError } from '@/api/client';
import {
  AdminScaffold,
  AnimatedPressable,
  Button,
  Card,
  ConfirmationModal,
  Icon,
  Input,
  SearchField,
  Screen,
  SectionHeader,
  SelectionSheet,
  Text,
  useToast,
} from '@/components';
import {
  useAcademicLevel,
  useAcademicOverview,
  useAcademicTree,
  useAcademicWorkspace,
  useArchiveAcademic,
  useArchiveImpact,
  useCreateAcademic,
  useSubjectSuggestions,
  useUpdateAcademic,
} from '@/hooks/useAcademic';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, radius, spacing } from '@/theme';
import type { AcademicKind, AcademicRecord } from '@/types';

const levels: { kind: AcademicKind; title: string; singular: string; parent?: AcademicKind; child?: AcademicKind }[] = [
  { kind: 'schools', title: 'Schools', singular: 'School', child: 'departments' },
  { kind: 'departments', title: 'Departments', singular: 'Department', parent: 'schools', child: 'programs' },
  { kind: 'programs', title: 'Programmes', singular: 'Programme', parent: 'departments', child: 'batches' },
  { kind: 'batches', title: 'Batches', singular: 'Batch', parent: 'programs', child: 'sections' },
  { kind: 'sections', title: 'Sections', singular: 'Section', parent: 'batches' },
  { kind: 'subjects', title: 'Subjects', singular: 'Subject' },
];
const parentField: Partial<Record<AcademicKind, keyof AcademicRecord>> = { departments:'schoolId', programs:'departmentId', batches:'programId', sections:'batchId' };

function validKind(value: string | undefined): AcademicKind {
  return levels.some((level) => level.kind === value) ? value as AcademicKind : 'schools';
}

export default function AcademicStructureScreen() {
  const params = useLocalSearchParams<{ kind?: string; selected?: string; create?: string; needsCurriculum?: string; parentId?: string; q?: string; status?: string }>();
  const toast = useToast();
  const { data: settings } = useInstitutionSettings();
  const overview = useAcademicOverview();
  const tree = useAcademicTree(true);
  const selectedKind = validKind(params.kind);
  const level = levels.find((item) => item.kind === selectedKind) ?? levels[0]!;
  const showingArchived = params.status === 'ARCHIVED';
  const list = useAcademicLevel(selectedKind, {
    pageSize: 100,
    active: !showingArchived,
    ...(params.q?.trim() ? { search:params.q.trim() } : {}),
    ...(params.needsCurriculum === 'true' ? { needsCurriculum:true } : {}),
  });
  const workspace = useAcademicWorkspace(selectedKind, params.selected);
  const create = useCreateAcademic();
  const update = useUpdateAcademic();
  const archive = useArchiveAcademic();
  const [editing, setEditing] = useState<AcademicRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(params.create === '1');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(params.parentId ?? '');
  const [startYear, setStartYear] = useState('');
  const [endYear, setEndYear] = useState('');
  const [parentOpen, setParentOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AcademicRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const impact = useArchiveImpact(selectedKind, archiveTarget?.id);
  const suggestions = useSubjectSuggestions(code, name);

  const parents = useMemo(() => level.parent && tree.data
    ? (tree.data[level.parent] as AcademicRecord[]).filter((item) => item.active)
    : [], [level.parent, tree.data]);

  const openEditor = (item?: AcademicRecord, inheritedParent?: string) => {
    setEditing(item ?? null);
    setCode(item?.code ?? '');
    setName(item?.name ?? '');
    setStartYear(item?.startYear?.toString() ?? '');
    setEndYear(item?.endYear?.toString() ?? '');
    setParentId(inheritedParent ?? (item && parentField[selectedKind] ? String(item[parentField[selectedKind]!] ?? '') : ''));
    setError(null);
    setEditorOpen(true);
  };
  const save = async () => {
    if (!code.trim() || !name.trim() || (level.parent && !parentId)) { setError('Complete every required field.'); return; }
    try {
      const payload = { kind:selectedKind, code:code.trim(), name:name.trim(), ...(parentId ? { parentId } : {}), ...(startYear ? { startYear:Number(startYear) } : {}), ...(endYear ? { endYear:Number(endYear) } : {}) };
      if (editing) await update.mutateAsync({ ...payload, id:editing.id, version:editing.version }); else await create.mutateAsync(payload);
      setEditorOpen(false);
      toast.show({ message: editing ? `${level.singular} updated` : `${level.singular} created`, tone:'success' });
    } catch (caught) { setError(isApiError(caught) ? caught.message : `Could not save the ${level.singular.toLowerCase()}.`); }
  };

  const selectLevel = (kind: string) => router.replace({ pathname:'/(admin)/academic-structure', params:{ kind } });
  const openRecord = (item: AcademicRecord) => router.push({ pathname:'/(admin)/academic-structure', params:{ kind:selectedKind, selected:item.id } });
  const restoreRecord = async (item: AcademicRecord) => {
    await update.mutateAsync({ kind:selectedKind, id:item.id, active:true, version:item.version });
    toast.show({ message:`${level.singular} restored`, tone:'success' });
    router.replace({ pathname:'/(admin)/academic-structure', params:{ kind:selectedKind } });
  };

  return (
    <AdminScaffold
      active="academic-structure"
      title={params.selected ? workspace.data?.record.name ?? level.singular : 'Academic structure'}
      subtitle={params.selected ? workspace.data?.record.code : 'School → Department → Programme → Batch → Section'}
      breadcrumbs={params.selected ? [{label:'Academic Structure',href:'/(admin)/academic-structure'},{label:level.title,href:`/(admin)/academic-structure?kind=${selectedKind}`},{label:workspace.data?.record.name ?? level.singular}] : undefined}
      onBack={params.selected ? () => router.back() : undefined}
      {...(settings ? { institutionName:settings.institutionName, institutionCode:settings.institutionCode } : {})}
      action={!params.selected ? <Button label={`Add ${level.singular}`} icon="add" size="sm" onPress={() => openEditor()} /> : undefined}
    >
      <Screen scrollable contentContainerStyle={styles.content}>
        {params.selected ? (
          <Workspace
            kind={selectedKind}
            data={workspace.data}
            onEdit={() => workspace.data && openEditor(workspace.data.record)}
            onArchive={() => workspace.data && setArchiveTarget(workspace.data.record)}
          />
        ) : (
          <>
            <View style={styles.overviewGrid}>
              {levels.filter((item) => item.kind !== 'subjects').map((item) => (
                <AnimatedPressable key={item.kind} onPress={() => selectLevel(item.kind)} style={[styles.overviewCard, item.kind === selectedKind && styles.overviewCardActive]}>
                  <Text variant="headlineSm" color={item.kind === selectedKind ? palette.primary : palette.onSurface}>{overview.data?.counts[item.kind] ?? 0}</Text>
                  <Text variant="labelMd" color={palette.onSurfaceVariant}>{item.title}</Text>
                </AnimatedPressable>
              ))}
            </View>
            <View style={styles.listBlock}>
              <SectionHeader title={level.title} meta={`${list.data?.total ?? 0} ${showingArchived ? 'archived' : 'active'}`} actionLabel={showingArchived ? 'View active' : 'View archived'} onAction={() => router.setParams({ status:showingArchived ? '' : 'ARCHIVED', selected:'' })} divider />
              <SearchField value={params.q ?? ''} onChangeText={(value) => router.setParams({ q:value })} placeholder={`Search ${level.title.toLowerCase()} by name or code`} />
              {params.needsCurriculum === 'true' ? <Card><Text color={palette.tertiaryFixedDim}>Showing programmes without a curriculum assignment.</Text></Card> : null}
              <Card padded={false}>
                {list.data?.items.length ? list.data.items.map((item, index) => (
                  <AnimatedPressable key={item.id} onPress={() => openRecord(item)} style={[styles.row, index < list.data.items.length - 1 && styles.divider]}>
                    <View style={styles.recordIcon}><Icon name={selectedKind === 'sections' ? 'students' : 'institution'} color={palette.primary} /></View>
                    <View style={styles.flex}>
                      <Text variant="bodyLg" color={palette.onSurface}>{item.name}</Text>
                      <Text variant="labelMd" color={palette.onSurfaceVariant}>{item.path?.map((pathItem) => pathItem.name).join(' / ') || item.code}</Text>
                    </View>
                    <Text variant="labelMd" color={palette.outline}>{Object.values(item.counts ?? {}).reduce((sum, count) => sum + count, 0)} linked</Text>
                    {!item.active ? <Button label="Restore" size="sm" variant="secondary" loading={update.isPending} onPress={() => void restoreRecord(item)} /> : null}
                    <Icon name="chevronRight" color={palette.outline} />
                  </AnimatedPressable>
                )) : <Text color={palette.onSurfaceVariant} style={styles.empty}>{list.isLoading ? 'Loading…' : `No active ${level.title.toLowerCase()} match this view.`}</Text>}
              </Card>
            </View>
          </>
        )}

        {editorOpen ? (
          <Card style={styles.editor}>
            <SectionHeader title={`${editing ? 'Edit' : 'Add'} ${level.singular}`} divider />
            {error ? <Text color={palette.error}>{error}</Text> : null}
            <Input label="Code" value={code} onChangeText={setCode} autoCapitalize="characters" />
            <Input label="Name" value={name} onChangeText={setName} />
            {selectedKind === 'subjects' && !editing && suggestions.data?.length ? <View style={styles.suggestions}><Text variant="labelMd" color={palette.tertiaryFixedDim}>Possible existing subjects</Text>{suggestions.data.map((subject) => <AnimatedPressable key={subject.id} style={styles.suggestionRow} onPress={() => { setEditorOpen(false); openRecord(subject); }}><View style={styles.flex}><Text color={palette.onSurface}>{subject.code} · {subject.name}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{subject.programmeCount} programmes · {subject.classCount} classes</Text></View><Icon name="chevronRight" color={palette.outline} /></AnimatedPressable>)}</View> : null}
            {level.parent ? <View style={styles.field}><Text variant="labelMd" color={palette.onSurface}>Parent</Text><Button label={parents.find((item) => item.id === parentId)?.name ?? 'Select parent'} variant="secondary" fullWidth onPress={() => setParentOpen(true)} /></View> : null}
            {selectedKind === 'batches' ? <View style={styles.years}><View style={styles.flex}><Input label="Start year" value={startYear} onChangeText={setStartYear} keyboardType="number-pad" /></View><View style={styles.flex}><Input label="End year" value={endYear} onChangeText={setEndYear} keyboardType="number-pad" /></View></View> : null}
            <View style={styles.actions}><Button label="Cancel" variant="secondary" onPress={() => setEditorOpen(false)} /><Button label="Save" loading={create.isPending || update.isPending} onPress={() => void save()} /></View>
          </Card>
        ) : null}
      </Screen>
      <SelectionSheet visible={parentOpen} title="Select parent" options={parents.map((item) => ({id:item.id,label:item.name,description:item.code,selected:item.id===parentId}))} onSelect={(id) => {setParentId(id);setParentOpen(false);}} onClose={() => setParentOpen(false)} searchable />
      <ConfirmationModal visible={Boolean(archiveTarget)} title={`Archive ${level.singular.toLowerCase()}?`} message={impact.isLoading ? 'Checking linked information…' : impact.data?.canArchive ? 'This item has no active dependencies and can be archived safely.' : `Archive is blocked because this item is still linked to ${Object.entries(impact.data?.blocking ?? {}).map(([key,value]) => `${value} ${key}`).join(', ')}.`} confirmLabel={impact.data?.canArchive ? 'Archive' : 'Close'} tone="warning" confirmLoading={archive.isPending || impact.isLoading} onCancel={() => setArchiveTarget(null)} onConfirm={() => { if (!archiveTarget || !impact.data?.canArchive) { setArchiveTarget(null); return; } void archive.mutateAsync({kind:selectedKind,id:archiveTarget.id}).then(() => {setArchiveTarget(null);router.back();}); }} />
    </AdminScaffold>
  );
}

function Workspace({ kind, data, onEdit, onArchive }: { kind:AcademicKind; data:ReturnType<typeof useAcademicWorkspace>['data']; onEdit:()=>void; onArchive:()=>void }) {
  if (!data) return <Card><Text color={palette.onSurfaceVariant}>Loading workspace…</Text></Card>;
  const child = levels.find((item) => item.kind === data.childKind);
  const contextKey: Record<AcademicKind,string> = {schools:'schoolId',departments:'departmentId',programs:'programId',batches:'batchId',sections:'sectionId',subjects:'subjectId'};
  const context = Object.fromEntries(data.path.map((item) => [contextKey[item.kind], item.id]));
  return <View style={styles.workspace}>
    <Card style={styles.identity}><View style={styles.identityTop}><View style={styles.recordIcon}><Icon name="institution" color={palette.primary} /></View><View style={styles.flex}><Text variant="headlineSm" color={palette.onSurface}>{data.record.name}</Text><Text color={palette.onSurfaceVariant}>{data.path.map((item) => item.name).join(' / ')}</Text></View><Button label="Edit" variant="secondary" size="sm" onPress={onEdit} /></View><View style={styles.counts}>{Object.entries(data.counts).filter(([,value])=>value>0).map(([label,value])=><View key={label} style={styles.count}><Text variant="titleLg" color={palette.onSurface}>{value}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{label}</Text></View>)}</View></Card>
    {data.childKind ? <View style={styles.listBlock}><SectionHeader title={child?.title ?? 'Children'} actionLabel={`Add ${child?.singular ?? 'child'}`} onAction={() => router.push({pathname:'/(admin)/academic-structure',params:{kind:data.childKind,parentId:data.record.id,create:'1'}})} divider /><Card padded={false}>{data.children.length ? data.children.map((item,index)=><AnimatedPressable key={item.id} onPress={()=>router.push({pathname:'/(admin)/academic-structure',params:{kind:data.childKind,selected:item.id}})} style={[styles.row,index<data.children.length-1&&styles.divider]}><View style={styles.flex}><Text variant="bodyLg" color={palette.onSurface}>{item.name}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{item.code}</Text></View><Icon name="chevronRight" color={palette.outline}/></AnimatedPressable>):<Text color={palette.onSurfaceVariant} style={styles.empty}>No {child?.title.toLowerCase()} yet.</Text>}</Card></View> : null}
    {kind === 'programs' ? <Card><SectionHeader title="Curriculum" meta={`${data.curriculum.length} subjects`} /><Button label="Manage curriculum" variant="secondary" onPress={()=>router.push({pathname:'/(admin)/curriculum',params:{programId:data.record.id}})} /></Card> : null}
    {kind === 'subjects' ? <View style={styles.listBlock}><SectionHeader title="Programmes using this subject" meta={`${data.curriculum.length} assignments`} divider /><Card padded={false}>{data.curriculum.length ? data.curriculum.map((link,index)=><AnimatedPressable key={link.id} style={[styles.row,index<data.curriculum.length-1&&styles.divider]} onPress={()=>link.program&&router.push({pathname:'/(admin)/academic-structure',params:{kind:'programs',selected:link.program.id}})}><View style={styles.flex}><Text variant="bodyLg" color={palette.onSurface}>{link.program?.name ?? 'Programme'}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{[link.school?.name,link.department?.name,link.semesterNumber ? `Semester ${link.semesterNumber}` : null].filter(Boolean).join(' / ')}</Text></View><Text variant="labelMd" color={palette.outline}>{link.classCount ?? 0} classes</Text><Icon name="chevronRight" color={palette.outline}/></AnimatedPressable>) : <Text color={palette.onSurfaceVariant} style={styles.empty}>This subject is not assigned to a programme yet.</Text>}</Card></View> : null}
    {kind === 'programs' || kind === 'batches' || kind === 'sections' ? <View style={styles.quickGrid}><Button label="Students" variant="secondary" onPress={()=>router.push({pathname:'/(admin)/students',params:context})}/><Button label="Classes" variant="secondary" onPress={()=>router.push({pathname:'/(admin)/classes',params:context})}/>{kind === 'sections' ? <Button label="Timetable" variant="secondary" onPress={()=>router.push({pathname:'/(admin)/timetable',params:context})}/> : null}<Button label="Attendance" variant="secondary" onPress={()=>router.push({pathname:'/(admin)/attendance',params:context})}/><Button label="Reports" variant="secondary" onPress={()=>router.push({pathname:'/(admin)/reports',params:context})}/>{kind === 'sections' ? <><Button label="Add student" icon="add" onPress={()=>router.push({pathname:'/(admin)/students/new',params:context})}/><Button label="Create class" icon="add" onPress={()=>router.push({pathname:'/(admin)/classes/new',params:context})}/></> : null}</View> : null}
    <View style={styles.listBlock}><SectionHeader title="Activity" meta={`${data.activity.length} recent`} divider /><Card>{data.activity.length ? data.activity.map((entry)=><View key={entry.id} style={styles.activity}><Text variant="bodyMd" color={palette.onSurface}>{entry.action.replaceAll('_',' ')}</Text><Text variant="labelMd" color={palette.onSurfaceVariant}>{new Date(entry.createdAt).toLocaleString()}</Text></View>):<Text color={palette.onSurfaceVariant}>No recent changes for this item.</Text>}</Card></View>
    <Button label="Archive" variant="ghost" icon="delete" onPress={onArchive} />
  </View>;
}

const styles = StyleSheet.create({ content:{maxWidth:980,width:'100%',alignSelf:'center',gap:spacing.lg,paddingBottom:spacing.xxl}, overviewGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}, overviewCard:{minWidth:140,flexGrow:1,padding:spacing.md,borderRadius:radius.xl,borderWidth:1,borderColor:palette.outlineVariant,backgroundColor:palette.surfaceContainerLow,gap:2}, overviewCardActive:{borderColor:palette.primary,backgroundColor:palette.primaryFixed}, listBlock:{gap:spacing.sm}, row:{minHeight:68,flexDirection:'row',alignItems:'center',gap:spacing.sm,padding:spacing.md}, divider:{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.outlineVariant}, recordIcon:{width:42,height:42,borderRadius:radius.full,alignItems:'center',justifyContent:'center',backgroundColor:palette.primaryFixed}, flex:{flex:1,minWidth:0,gap:2}, empty:{padding:spacing.lg}, editor:{gap:spacing.md}, field:{gap:spacing.sm}, years:{flexDirection:'row',gap:spacing.md}, actions:{flexDirection:'row',justifyContent:'flex-end',gap:spacing.sm}, suggestions:{gap:spacing.xs,padding:spacing.sm,borderRadius:radius.lg,backgroundColor:palette.surfaceContainerHigh}, suggestionRow:{flexDirection:'row',alignItems:'center',gap:spacing.sm,paddingVertical:spacing.sm}, workspace:{gap:spacing.lg}, identity:{gap:spacing.md}, identityTop:{flexDirection:'row',alignItems:'center',gap:spacing.sm}, counts:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}, count:{minWidth:100,padding:spacing.sm,borderRadius:radius.lg,backgroundColor:palette.surfaceContainerHigh,gap:2}, quickGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}, activity:{paddingVertical:spacing.sm,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:palette.outlineVariant,gap:2} });

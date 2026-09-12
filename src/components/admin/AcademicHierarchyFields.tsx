import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAcademicTree } from '@/hooks/useAcademic';
import { palette, spacing } from '@/theme';
import { Button } from '../primitives/Button';
import { Text } from '../primitives/Text';
import { SelectionSheet } from './SelectionSheet';

export type HierarchyLevel='schools'|'departments'|'programs'|'batches'|'sections';
export interface HierarchySelection { schoolId:string;departmentId:string;programId:string;batchId:string;sectionId:string }
const levels:{key:HierarchyLevel;label:string;id:keyof HierarchySelection;parent?:keyof HierarchySelection;parentField?:'schoolId'|'departmentId'|'programId'|'batchId'}[]=[
 {key:'schools',label:'School',id:'schoolId'},{key:'departments',label:'Department',id:'departmentId',parent:'schoolId',parentField:'schoolId'},
 {key:'programs',label:'Programme',id:'programId',parent:'departmentId',parentField:'departmentId'},{key:'batches',label:'Batch',id:'batchId',parent:'programId',parentField:'programId'},
 {key:'sections',label:'Section',id:'sectionId',parent:'batchId',parentField:'batchId'},
];
export function AcademicHierarchyFields({value,onChange,through='sections',locked={}}:{value:HierarchySelection;onChange:(value:HierarchySelection)=>void;through?:HierarchyLevel;locked?:Partial<Record<keyof HierarchySelection,boolean>>}){
 const tree=useAcademicTree();const [open,setOpen]=useState<HierarchyLevel|null>(null);const visible=levels.slice(0,levels.findIndex(x=>x.key===through)+1);const current=levels.find(x=>x.key===open);
 const options=useMemo(()=>!open||!tree.data?[]:tree.data[open].filter(row=>row.active&&(!current?.parentField||row[current.parentField]===value[current.parent!])).map(row=>({id:row.id,label:row.name,description:row.code,selected:row.id===value[current!.id]})),[open,tree.data,current,value]);
 const choose=(id:string)=>{if(!current)return;const next={...value,[current.id]:id};const index=levels.findIndex(x=>x.key===current.key);for(const child of levels.slice(index+1))next[child.id]='';onChange(next);setOpen(null)};
 return <><View style={styles.wrap}>{visible.map(level=><View style={styles.field} key={level.key}><Text variant="labelMd" color={palette.onSurface}>{level.label}{locked[level.id] ? ' · inherited' : ''}</Text><Button label={tree.data?.[level.key].find(x=>x.id===value[level.id])?.name??`Select ${level.label.toLowerCase()}`} variant="secondary" fullWidth disabled={tree.isLoading||locked[level.id]||!!(level.parent&&!value[level.parent])} onPress={()=>setOpen(level.key)}/></View>)}</View><SelectionSheet visible={open!==null} title={`Choose ${current?.label.toLowerCase()??'record'}`} subtitle="Changing a parent clears every dependent selection." options={options} onSelect={choose} onClose={()=>setOpen(null)} searchable emptyMessage="Create an active record under the selected parent first."/></>
}
const styles=StyleSheet.create({wrap:{gap:spacing.md},field:{gap:spacing.sm}});

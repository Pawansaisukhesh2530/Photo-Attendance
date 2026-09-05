import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AdminScaffold, Button, Card, Input, Screen, SectionHeader, Text, useToast } from '@/components';
import { useCreateStudent } from '@/hooks/useStudents';
import { useInstitutionSettings } from '@/hooks/useSettings';
import { palette, spacing, useResponsive } from '@/theme';
import { isApiError } from '@/api/client';

export default function NewStudentScreen(){
 const {isExpanded}=useResponsive(); const {data:settings}=useInstitutionSettings(); const create=useCreateStudent(); const toast=useToast();
 const [name,setName]=useState(''); const [studentId,setStudentId]=useState(''); const [rollNumber,setRollNumber]=useState(''); const [department,setDepartment]=useState(''); const [semester,setSemester]=useState('1'); const [section,setSection]=useState(''); const [error,setError]=useState<string|null>(null);
 const save=async()=>{setError(null);if(!name.trim()||!studentId.trim()||!rollNumber.trim()||!department.trim()||!section.trim()){setError('Complete every field.');return} try{const student=await create.mutateAsync({name:name.trim(),studentId:studentId.trim(),rollNumber:rollNumber.trim(),department:department.trim(),semester:Number(semester),section:section.trim()});toast.show({message:`${student.name} added`,tone:'success'});router.replace({pathname:'/(admin)/students/[studentId]',params:{studentId:student.id}})}catch(e){setError(isApiError(e)?e.message:'Could not add student.')}};
 return <AdminScaffold active="students" title="Add student" subtitle="Create the student before enrolling face photos" breadcrumbs={[{label:'Administration',href:'/(admin)/dashboard'},{label:'Students',href:'/(admin)/students'},{label:'Add student'}]} onBack={()=>router.back()} {...(settings?{institutionName:settings.institutionName,institutionCode:settings.institutionCode}:{})}>
  <Screen scrollable respectBottomInset={!isExpanded} contentContainerStyle={styles.content}>
   {error?<Card style={styles.error}><Text color={palette.onErrorContainer}>{error}</Text></Card>:null}
   <SectionHeader title="Student identity" divider/><Card>
    <Input label="Full name" value={name} onChangeText={setName} placeholder="Student name" autoCapitalize="words"/><View style={styles.gap}/>
    <Input label="Student ID" value={studentId} onChangeText={setStudentId} placeholder="24112515" autoCapitalize="characters"/><View style={styles.gap}/>
    <Input label="Roll number" value={rollNumber} onChangeText={setRollNumber} placeholder="CSE-01" autoCapitalize="characters"/>
   </Card>
   <View style={styles.section}><SectionHeader title="Academic details" divider/><Card>
    <Input label="Department" value={department} onChangeText={setDepartment} placeholder="Computer Science"/><View style={styles.gap}/>
    <Input label="Semester" value={semester} onChangeText={setSemester} keyboardType="number-pad" placeholder="1"/><View style={styles.gap}/>
    <Input label="Section" value={section} onChangeText={setSection} placeholder="A" autoCapitalize="characters"/>
   </Card></View>
   <Button label="Add student" icon="add" fullWidth loading={create.isPending} onPress={()=>void save()} style={styles.save}/>
  </Screen>
 </AdminScaffold>
}
const styles=StyleSheet.create({content:{maxWidth:760,width:'100%',alignSelf:'center',paddingBottom:spacing.xl},gap:{height:spacing.md},section:{marginTop:spacing.lg},save:{marginTop:spacing.lg},error:{marginBottom:spacing.md,backgroundColor:palette.errorContainer}});

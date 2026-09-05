import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { studentService } from '@/services';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Icon } from '@/components/primitives/Icon';
import { Text } from '@/components/primitives/Text';
import { palette, spacing } from '@/theme';
import type { FaceImageInfo } from '@/types';

export interface FaceEnrolmentCardProps { enrolled:boolean; studentName:string; studentId:string }
export function FaceEnrolmentCard({enrolled,studentName,studentId}:FaceEnrolmentCardProps){
 const [images,setImages]=useState<FaceImageInfo[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null);
 const load=useCallback(async()=>{try{setImages(await studentService.getFaceImages(studentId))}catch{setImages([])}},[studentId]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer)},[load]);
 const choose=async()=>{setMessage(null);const picked=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:5,quality:1});if(picked.canceled)return;if(picked.assets.length<3||picked.assets.length>5){setMessage('Choose 3–5 different clear portrait photos.');return}setBusy(true);try{await studentService.uploadFaceImages(studentId,picked.assets.map(x=>x.uri));setMessage('Photos uploaded. Face processing has started.');await load()}catch{setMessage('Could not upload these photos. Check each photo contains exactly one clear face.')}finally{setBusy(false)}};
 return <Card><View style={styles.header}><Icon name={enrolled||images.length>=3?'present':'person'} size={20} color={palette.primary}/><View style={styles.flex}><Text variant="labelMd" color={palette.onSurfaceVariant}>FACE ENROLMENT</Text><Text variant="titleLg">{studentName}</Text></View></View><Text variant="bodyMd" color={palette.onSurfaceVariant}>{images.length} enrolment photo(s). Add 3–5 current, well-lit portraits from slightly different angles.</Text>{message?<Text variant="labelMd" color={palette.primary}>{message}</Text>:null}<Button label={images.length?'Replace with 3–5 photos':'Enrol 3–5 face photos'} icon="photo" variant="secondary" fullWidth loading={busy} onPress={()=>void choose()}/>{images.length?<Button label="Reprocess photos" variant="ghost" fullWidth onPress={()=>void studentService.reprocessFaceImages(studentId).then(load)}/>:null}</Card>
}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:spacing.sm},flex:{flex:1}});

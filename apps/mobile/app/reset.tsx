import { useState } from 'react';
import { TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BrandText, Button, Card, Screen } from '@/components/BrandUI';
import { endpoints } from '@/lib/api';
import { font, palette as c } from '@/theme';

export default function ResetPassword() { const { token } = useLocalSearchParams<{ token?: string }>(); const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false); async function submit(){if(password!==confirm){setError('Passwords do not match.');return;}setBusy(true);setError('');try{await endpoints.reset(token??'',password);setDone(true)}catch(e){setError(e instanceof Error?e.message:'Please try again.')}finally{setBusy(false)}}return <Screen title="Choose a new password." subtitle="Keep your SoFlo Suds account secure."><Card>{done?<><BrandText>Your password has been reset.</BrandText><Button label="Log in" onPress={()=>router.replace('/login')} style={{marginTop:17}}/></>:<><BrandText>New password</BrandText><TextInput value={password} onChangeText={setPassword} secureTextEntry style={input}/><BrandText>Confirm password</BrandText><TextInput value={confirm} onChangeText={setConfirm} secureTextEntry style={input}/>{!!error&&<BrandText style={{color:c.magentaLight,marginBottom:12}}>{error}</BrandText>}<Button label={busy?'Saving…':'Reset password'} onPress={submit} disabled={busy||!token||password.length<8||!confirm}/></>}</Card></Screen>}
const input={backgroundColor:c.bg,borderWidth:1,borderColor:c.border,color:c.text,fontFamily:font.body,borderRadius:8,height:47,paddingHorizontal:14,marginTop:6,marginBottom:16} as const;

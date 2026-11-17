export type CommitmentEvidence = {
  id:string; commitment_id:string; storage_path:string; file_name:string;
  mime_type:"application/pdf"|"image/jpeg"|"image/png"|"image/webp";
  byte_size:number; content_sha256:string; created_at:string;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME=new Set<CommitmentEvidence["mime_type"]>(["application/pdf","image/jpeg","image/png","image/webp"]);
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
export function parseCommitmentEvidence(value:unknown):CommitmentEvidence[]{
 if(!Array.isArray(value)||value.length>1000)throw new Error("قائمة مستندات الالتزامات غير صالحة.");
 const ids=new Set<string>();
 return value.map((raw):CommitmentEvidence=>{
  if(!isRecord(raw)||typeof raw.id!=="string"||!UUID.test(raw.id)||
   typeof raw.commitment_id!=="string"||!UUID.test(raw.commitment_id)||
   typeof raw.storage_path!=="string"||!raw.storage_path.startsWith(raw.commitment_id+"/")||
   !UUID.test(raw.storage_path.slice(raw.commitment_id.length+1).replace(/\.(pdf|jpg|png|webp)$/i,""))||
   typeof raw.file_name!=="string"||raw.file_name.length<1||raw.file_name.length>180||/[\\/\u0000-\u001f]/.test(raw.file_name)||
   typeof raw.mime_type!=="string"||!MIME.has(raw.mime_type as CommitmentEvidence["mime_type"])||
   typeof raw.byte_size!=="number"||!Number.isSafeInteger(raw.byte_size)||raw.byte_size<1||raw.byte_size>10485760||
   typeof raw.content_sha256!=="string"||!/^[0-9a-f]{64}$/.test(raw.content_sha256)||
   typeof raw.created_at!=="string"||!Number.isFinite(Date.parse(raw.created_at))||ids.has(raw.id)){
   throw new Error("توجد بيانات مستند مصدر غير صالحة؛ أوقفنا عرض المستند.");
  }
  ids.add(raw.id);
  return {id:raw.id,commitment_id:raw.commitment_id,storage_path:raw.storage_path,file_name:raw.file_name,
   mime_type:raw.mime_type as CommitmentEvidence["mime_type"],byte_size:raw.byte_size,
   content_sha256:raw.content_sha256,created_at:raw.created_at};
 });
}
export function canAttachCommitmentEvidence(input:{status:string;creatorProfileId:string;currentProfileId:string;evidenceCount:number}):boolean{
 return input.status==="pending_approval"&&input.creatorProfileId.length>0&&input.creatorProfileId===input.currentProfileId&&
  Number.isInteger(input.evidenceCount)&&input.evidenceCount>=0&&input.evidenceCount<10;
}
export function isCommitmentEvidenceReviewable(input:{
 expectedCount:number;loadedCount:number;loadFailed:boolean;accessibleCount:number;reviewedCount:number
}):boolean{
 const accessible=input.accessibleCount;
 const reviewed=input.reviewedCount;
 return !input.loadFailed&&Number.isInteger(input.expectedCount)&&Number.isInteger(input.loadedCount)&&
  Number.isInteger(accessible)&&Number.isInteger(reviewed)&&input.expectedCount>0&&
  input.loadedCount===input.expectedCount&&accessible===input.expectedCount&&reviewed===input.expectedCount;
}

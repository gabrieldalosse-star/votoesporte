import {normalizeGender} from './data-integrity.mjs';
export const PERSON_FIELDS=['globalStudentId','fullName','preferredName','birthDate','gender','guardianName','guardianPhone','studentPhone','phone','guardianEmail','contactTarget','contactPermission','contactConsentDate','postalCode','state','street','number','complement','neighborhood','city','school','shift','pcdStatus','registrationDate','territoryZoneId','territoryZoneName','territorySector','territorySource','territoryMatchMethod','censusCode','censusIntegrationId','censusReferenceDate','censusReviewStatus','notes'];
export function flattenPerson(row) {
  const s={...row};const nested={guardianPhone:row.contact?.guardianPhone,studentPhone:row.contact?.studentPhone,phone:row.contact?.alternatePhone,contactTarget:row.contact?.target,contactPermission:row.contact?.permission,contactConsentDate:row.contact?.consentDate,territoryZoneId:row.geo?.zoneId,territoryZoneName:row.geo?.zoneLabel,territorySector:row.geo?.sector,territorySource:row.geo?.sourceVersion,territoryMatchMethod:row.geo?.matchMethod,censusCode:row.census?.externalCode,censusIntegrationId:row.census?.integrationId,censusReferenceDate:row.census?.referenceDate,censusReviewStatus:row.census?.reviewStatus};
  for(const [k,v] of Object.entries(nested))if((s[k]===undefined||s[k]==='')&&v!==undefined)s[k]=v;
  s.gender=normalizeGender(s.gender);
  return Object.fromEntries(PERSON_FIELDS.filter(k=>s[k]!==undefined&&s[k]!==null&&typeof s[k]!=='object').map(k=>[k,String(s[k])]));
}
export function completePerson(master, enrollments=[]) {
  const result=flattenPerson(master);
  for(const enrollment of enrollments)for(const [k,v] of Object.entries(flattenPerson(enrollment)))if(!result[k])result[k]=v;
  return result;
}
export function fillPersonForm(form, person) {
  // Class, enrollment ID, enrollment code and status belong to the new enrollment.
  for(const key of PERSON_FIELDS)if(form.elements[key])form.elements[key].value=person[key]||'';
}

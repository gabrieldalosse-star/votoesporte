/*
 * Execute apenas em uma estação administrativa confiável, fora do navegador:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/seguro/service-account.json node tools/provision-admin.mjs
 * A chave de serviço não deve ser versionada, anexada ao site nem compartilhada.
 */
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const ADMIN_EMAIL = "gabrieldalosse@gmail.com";
const projectId = "vtesporte-d3b9d";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Defina GOOGLE_APPLICATION_CREDENTIALS para uma conta de serviço autorizada. Nada foi alterado.");
}

const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId });
const account = await getAuth(app).getUserByEmail(ADMIN_EMAIL);
await getFirestore(app).collection("adminUsers").doc(account.uid).set({
  email: ADMIN_EMAIL,
  provisionedAt: new Date().toISOString(),
  provisionedBy: "trusted-admin-script-v7"
}, { merge: true });

console.log(`Administração provisionada para ${ADMIN_EMAIL} (UID ${account.uid}).`);

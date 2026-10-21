import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../assets/app.js',import.meta.url),'utf8');
const extract=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
function setup(overrides={}) {
  const messages=[],calls=[];
  const ui={};
  for(const id of ['auth-email','auth-password','email-sign-in','email-sign-up','email-password-reset','google-sign-in'])ui[id]={value:'',disabled:false,textContent:'',lastChild:{textContent:''}};
  ui['auth-email'].value='teacher@example.test';ui['auth-email'].checkValidity=()=>true;ui['auth-email'].reportValidity=()=>{};
  ui['auth-password'].value='original password';
  const state={};
  const context={ui,state,firebase:{auth:{}},showAuthMessage:m=>messages.push(m),
    signInWithEmailAndPassword:async(auth,email,password)=>calls.push(['login',email,password]),
    createUserWithEmailAndPassword:async(auth,email,password)=>calls.push(['create',email,password]),
    sendPasswordResetEmail:async(auth,email)=>calls.push(['recovery',email]),...overrides};
  vm.createContext(context);
  vm.runInContext(extract('function friendlyFirebaseError','function formValues')+
    extract('function currentAuthEmail','function wireStaticEvents')+
    extract('function setAuthBusy','function setActiveView')+
    '\nglobalThis.handlers={login:signInWithEmailPassword,create:signUpWithEmailPassword,reset:requestPasswordRecovery};',context);
  return {context,ui,state,messages,calls,handlers:context.handlers};
}
test('existing signup gives login/recovery guidance without resetting or retrying a password automatically',async()=>{
  const h=setup({createUserWithEmailAndPassword:async()=>{throw {code:'auth/email-already-in-use'};}});
  await h.handlers.create();assert.match(h.messages.at(-1),/Entrar na plataforma/);assert.match(h.messages.at(-1),/Esqueci minha senha/);
  assert.equal(h.calls.length,0);assert.equal(h.state.authBusy,false);assert.equal(h.ui['email-sign-up'].disabled,false);
});
test('login preserves password spaces and trims only the email',async()=>{
  const h=setup();h.ui['auth-password'].value=' original password ';h.ui['auth-email'].value=' teacher@example.test ';
  await h.handlers.login({preventDefault(){}});
  assert.deepEqual(h.calls,[['login','teacher@example.test',' original password ']]);
});
test('password recovery needs only an email and sends once per explicit request',async()=>{
  const h=setup();h.ui['auth-password'].value='';await h.handlers.reset();
  assert.deepEqual(h.calls,[['recovery','teacher@example.test']]);assert.equal(h.context.firebase.auth.languageCode,'pt-BR');
  assert.match(h.messages.at(-1),/Se houver uma conta/);assert.equal(h.state.authBusy,false);
});
test('invalid email and uninitialized auth never issue recovery requests',async()=>{
  const h=setup();h.ui['auth-email'].checkValidity=()=>false;await h.handlers.reset();assert.equal(h.calls.length,0);
  h.context.firebase.auth=null;await h.handlers.create();await h.handlers.login();await h.handlers.reset();
  assert.equal(h.calls.length,0);assert.match(h.messages.at(-1),/não iniciou/);
});
test('busy guard prevents recovery and account-creation attempts during sign-in',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const h=setup({signInWithEmailAndPassword:async()=>{await pending;}});
  const login=h.handlers.login();assert.equal(h.state.authBusy,true);assert.equal(h.ui['email-password-reset'].disabled,true);
  await h.handlers.reset();await h.handlers.create();assert.equal(h.calls.length,0);release();await login;
  assert.equal(h.state.authBusy,false);assert.equal(h.ui['email-password-reset'].disabled,false);
});
test('recovery keeps account existence private and restores controls after network errors',async()=>{
  const h=setup({sendPasswordResetEmail:async()=>{throw {code:'auth/user-not-found'};}});
  await h.handlers.reset();assert.match(h.messages.at(-1),/Se houver uma conta/);
  h.context.sendPasswordResetEmail=async()=>{throw {code:'auth/network-request-failed'};};
  await h.handlers.reset();assert.match(h.messages.at(-1),/rede/);assert.equal(h.ui['email-password-reset'].disabled,false);
});

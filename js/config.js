/* Configuração do Firebase.
   Cole aqui o bloco "firebaseConfig" do console do Firebase
   (Configurações do projeto > Seus apps > App da Web).
   Esses valores são públicos por natureza: quem protege os dados
   são as regras em firestore.rules, que só liberam cada usuário
   para os próprios documentos.
   Enquanto ficar null, o site funciona salvando só no navegador. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDODfZnK4pMSCmiQ9nv5SiYLkG5VDmjSV4",
  authDomain: "livro-caixa-d18e4.firebaseapp.com",
  projectId: "livro-caixa-d18e4",
  storageBucket: "livro-caixa-d18e4.firebasestorage.app",
  messagingSenderId: "237265851389",
  appId: "1:237265851389:web:8ffcc24eea1eedee0fff94"
};

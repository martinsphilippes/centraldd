// Configuração do projeto Firebase (Console → Configurações do projeto → Seus apps → Web).
// Estes valores são públicos por natureza (identificam o projeto no cliente);
// a segurança real fica nas regras do Firestore (arquivo firestore.rules).

export const firebaseConfig = {
  apiKey: 'AIzaSyDdvtQq72uYh4zzjFMg5PxXj9QPH78flks',
  authDomain: 'mldisponibilidade.firebaseapp.com',
  projectId: 'mldisponibilidade',
  storageBucket: 'mldisponibilidade.firebasestorage.app',
  messagingSenderId: '433672910251',
  appId: '1:433672910251:web:a43fa36f7f07a8c42f4eee',
}

/** true enquanto a configuração ainda não foi preenchida. */
export const configPendente = firebaseConfig.apiKey === 'COLE_AQUI'

/**
 * E-mails autorizados a virar DISPATCHER automaticamente no primeiro login.
 * Qualquer outra conta sem perfil criado pelo Dispatcher é desconectada.
 * (Mantenha em sincronia com firestore.rules.)
 */
export const EMAILS_DISPATCHER = ['martinsphilippes@gmail.com']

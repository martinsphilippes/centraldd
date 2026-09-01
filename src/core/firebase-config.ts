// Configuração do projeto Firebase (Console → Configurações do projeto → Seus apps → Web).
// Estes valores são públicos por natureza (identificam o projeto no cliente);
// a segurança real fica nas regras do Firestore (arquivo firestore.rules).

export const firebaseConfig = {
  apiKey: 'AIzaSyABnoHfZHRyYcmsRI06oOZEDEpt2NjzvYM',
  authDomain: 'centraldispatcherdriver.firebaseapp.com',
  projectId: 'centraldispatcherdriver',
  storageBucket: 'centraldispatcherdriver.firebasestorage.app',
  messagingSenderId: '161597441931',
  appId: '1:161597441931:web:7bf11f42915dbaf7a1918e',
}

/** true enquanto a configuração ainda não foi preenchida. */
export const configPendente = firebaseConfig.apiKey === 'COLE_AQUI'

/**
 * E-mails autorizados a virar DISPATCHER automaticamente no primeiro login.
 * Qualquer outra conta sem perfil criado pelo Dispatcher é desconectada.
 * (Mantenha em sincronia com firestore.rules.)
 */
export const EMAILS_DISPATCHER = ['martinsphilippes@gmail.com']

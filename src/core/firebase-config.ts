// Configuração do projeto Firebase (Console → Configurações do projeto → Seus apps → Web).
// Estes valores são públicos por natureza (identificam o projeto no cliente);
// a segurança real fica nas regras do Firestore (arquivo firestore.rules).

export const firebaseConfig = {
  apiKey: 'COLE_AQUI',
  authDomain: 'COLE_AQUI.firebaseapp.com',
  projectId: 'COLE_AQUI',
  storageBucket: 'COLE_AQUI.appspot.com',
  messagingSenderId: 'COLE_AQUI',
  appId: 'COLE_AQUI',
}

/** true enquanto a configuração ainda não foi preenchida. */
export const configPendente = firebaseConfig.apiKey === 'COLE_AQUI'

/**
 * E-mails autorizados a virar COORDENADOR automaticamente no primeiro login.
 * Qualquer outra conta sem perfil criado pela coordenação é desconectada.
 * (Mantenha em sincronia com firestore.rules.)
 */
export const EMAILS_COORDENADOR = ['martinsphilippes@gmail.com']

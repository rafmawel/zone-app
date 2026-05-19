export function frenchAuthError(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Adresse email invalide.';
    case 'auth/user-disabled':
      return 'Ce compte a été désactivé.';
    case 'auth/user-not-found':
      return 'Aucun compte ne correspond à cet email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email ou mot de passe incorrect.';
    case 'auth/email-already-in-use':
      return 'Un compte existe déjà avec cet email.';
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    case 'auth/network-request-failed':
      return 'Erreur réseau. Vérifie ta connexion.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie plus tard.';
    case 'auth/missing-password':
      return 'Mot de passe requis.';
    default:
      return "Une erreur est survenue. Réessaie.";
  }
}

// Libellés et couleurs des rôles party-cipate, alignés sur l'onglet Chat du launcher.
export const ROLE_LABELS = {
  admin: 'Admin',
  producteur: 'Producteur',
  vip: 'VIP',
  candidat: 'Candidat',
  member: 'Membre'
};

export const ROLE_COLORS = {
  admin: 0xff8a00,
  producteur: 0xa78bfa,
  vip: 0xfacc15,
  candidat: 0x22d3ee,
  member: 0x94a3b8
};

export function roleLabel(role) {
  return ROLE_LABELS[role] || ROLE_LABELS.member;
}

export function roleColor(role) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.member;
}

export type Plan = { id: string; label: string; price: string; period: string; audience: string };

// ⚠ Source unique des formules affichées. Vérifiez que les prix correspondent à ceux configurés dans Stripe.
export const PLANS: Plan[] = [
  { id: "starter", label: "Starter", price: "49 €", period: "/ mois", audience: "Pour les PME qui démarrent" },
  { id: "business", label: "Business", price: "149 €", period: "/ mois", audience: "Pour les organisations en croissance" },
  { id: "production", label: "Production", price: "349 €", period: "/ mois", audience: "Pour un environnement complet" },
];

export const INCLUDED = [
  "Saisie et validation des notes de frais",
  "Gestion des justificatifs et remboursements",
  "Suivi des frais professionnels par collaborateur",
  "Accès sécurisé pour votre équipe",
];

export const COUNTRIES: [string, string][] = [
  ["TN", "Tunisie"], ["CH", "Suisse"], ["FR", "France"], ["BE", "Belgique"],
  ["DE", "Allemagne"], ["NL", "Pays-Bas"], ["MA", "Maroc"], ["DZ", "Algérie"],
];

/** Événement navigateur : un bouton de la grille tarifaire présélectionne la formule dans le formulaire. */
export const PLAN_EVENT = "softstream:select-plan";

/**
 * Fenêtre de validité du compte Axelor (activateOn / expiresOn).
 * La date d'expiration suit la fin de la période PAYÉE chez Stripe (mensuel, trimestriel, semestriel ou annuel),
 * plus quelques jours de grâce. Axelor refuse la connexion après expiresOn, même si un webhook est manqué.
 */
export function accessWindow(periodEnd: Date | null, graceDays: number): { activateOn: Date; expiresOn: Date } {
  const now = new Date();
  const base = periodEnd ?? new Date(new Date(now).setMonth(now.getMonth() + 1));
  return { activateOn: now, expiresOn: new Date(base.getTime() + graceDays * 86_400_000) };
}

/**
 * Format attendu par le champ Axelor. À régler d'après le type de la colonne (voir CORRECTIFS_V2.md) :
 *  - "date"     (colonne date)                        -> 2026-12-05
 *  - "datetime" (timestamp sans fuseau)               -> 2026-12-05T10:00:00
 *  - "zoned"    (timestamp avec fuseau)               -> 2026-12-05T10:00:00.000Z
 */
export function toAxelorDate(d: Date, type: string): string {
  const iso = d.toISOString();
  switch (type) {
    case "datetime":
      return iso.slice(0, 19);
    case "zoned":
      return iso;
    default:
      return iso.slice(0, 10);
  }
}

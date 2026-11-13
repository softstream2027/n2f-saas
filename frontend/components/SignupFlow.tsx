"use client";

import { useEffect, useMemo, useState } from "react";
import { readJsonResponse, resolveApiBase } from "@/lib/api";
import { COUNTRIES, INCLUDED, PLAN_EVENT, PLANS } from "@/lib/plans";

const API = resolveApiBase();

type Mode = "new" | "join";

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; companyName: string; expiresOn?: string; hasActiveOffer: boolean }
  | { state: "notfound" }
  | { state: "error" };

const INITIAL = { companyName: "", taxId: "", country: "TN", email: "", login: "", plan: "starter" };

export default function SignupFlow() {
  const [form, setForm] = useState(INITIAL);
  const [mode, setMode] = useState<Mode>("new");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const selectedPlan = useMemo(() => PLANS.find((p) => p.id === form.plan) ?? PLANS[0], [form.plan]);
  const isJoin = mode === "join";

  const set =
    (k: keyof typeof INITIAL) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));

  // Une formule choisie dans la grille tarifaire est présélectionnée ici.
  useEffect(() => {
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (PLANS.some((p) => p.id === id)) setForm((prev) => ({ ...prev, plan: id }));
    };
    window.addEventListener(PLAN_EVENT, onSelect);
    return () => window.removeEventListener(PLAN_EVENT, onSelect);
  }, []);

  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setLookup({ state: "idle" });
    if (next === "new") setForm((prev) => ({ ...prev, companyName: "", country: "TN" }));
  }

  // Rattachement : retrouve la société à partir du matricule fiscal.
  useEffect(() => {
    if (!isJoin || form.taxId.trim().length < 3) {
      setLookup({ state: "idle" });
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ state: "loading" });
      try {
        const params = new URLSearchParams({ taxId: form.taxId.trim() });
        if (form.login.trim()) params.set("login", form.login.trim());
        const res = await fetch(`${API}/api/signup/company?${params.toString()}`, { signal: ctrl.signal });
        if (!res.ok) return setLookup({ state: "error" });
        const text = await res.text();
        const data = text
          ? (JSON.parse(text) as { companyName?: string; country?: string; expiresOn?: string; hasActiveOffer?: boolean })
          : null;
        if (!data?.companyName) return setLookup({ state: "notfound" });
        setForm((prev) => ({ ...prev, companyName: data.companyName ?? "", country: data.country ?? prev.country }));
        setLookup({
          state: "found",
          companyName: data.companyName,
          expiresOn: data.expiresOn,
          hasActiveOffer: Boolean(data.hasActiveOffer),
        });
      } catch (err: any) {
        if (err?.name !== "AbortError") setLookup({ state: "error" });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [isJoin, form.taxId, form.login]);

  const blockedByOffer = lookup.state === "found" && lookup.hasActiveOffer;
  const canSubmit = !loading && !blockedByOffer && (!isJoin || lookup.state === "found") && acceptedTerms;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedTerms) {
      setError("Vous devez accepter les conditions générales avant de continuer au paiement.");
      return;
    }
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, simpleUser: isJoin }),
      });
      const data = await readJsonResponse<{ tenantId?: string; checkoutUrl?: string; message?: string | string[] }>(res);
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(" ") : data.message;
        throw new Error(msg ?? "L’inscription n’a pas pu aboutir. Vérifiez les informations saisies et réessayez.");
      }
      if (!data.checkoutUrl) throw new Error("La page de paiement n’a pas pu être ouverte. Réessayez dans un instant.");
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      setError(err.message ?? "Une erreur est survenue. Réessayez dans un instant.");
      setLoading(false);
    }
  }

  return (
    <div className="signup">
      <aside className="order" aria-label="Récapitulatif de votre commande">
        <h3>Votre commande</h3>
        <div className="order-line">
          <span>Formule {selectedPlan.label}</span>
          <strong className="num">{selectedPlan.price} <small>{selectedPlan.period}</small></strong>
        </div>
        <p className="muted">{selectedPlan.audience}</p>
        <ul className="check-list">
          {INCLUDED.map((i) => <li key={i}>{i}</li>)}
        </ul>

        <h4>Après le paiement</h4>
        <ol className="steps">
          <li>Votre société et votre comptabilité sont créées.</li>
          <li>Votre accès utilisateur est configuré.</li>
          <li>Votre login et votre mot de passe temporaire arrivent par e-mail.</li>
        </ol>
      </aside>

      <form className="form" onSubmit={submit} noValidate={false}>
        <fieldset className="segmented">
          <legend className="sr-only">Type d’inscription</legend>
          <label className={!isJoin ? "on" : ""}>
            <input type="radio" name="mode" checked={!isJoin} onChange={() => changeMode("new")} />
            Nouvelle société
          </label>
          <label className={isJoin ? "on" : ""}>
            <input type="radio" name="mode" checked={isJoin} onChange={() => changeMode("join")} />
            Rejoindre une société
          </label>
        </fieldset>

        <fieldset className="group">
          <legend>1. Votre société</legend>

          {isJoin && (
            <p className="hint">
              Saisissez le matricule fiscal : la société et le pays sont retrouvés automatiquement. Le responsable
              crée la société, les autres utilisateurs viennent s’y rattacher.
            </p>
          )}

          <div className="grid">
            <div className="field">
              <label htmlFor="taxId">Matricule fiscal</label>
              <input
                id="taxId"
                required
                minLength={3}
                maxLength={30}
                autoComplete="off"
                value={form.taxId}
                onChange={set("taxId")}
                aria-describedby={isJoin ? "lookup-status" : undefined}
              />
            </div>

            <div className="field">
              <label htmlFor="country">Pays</label>
              <select id="country" value={form.country} onChange={set("country")} disabled={isJoin}>
                {COUNTRIES.map(([code, name]) => (
                  <option key={code} value={code}>{name}</option>
                ))}
              </select>
            </div>

            <div className="field full">
              <label htmlFor="companyName">Nom de la société</label>
              <input
                id="companyName"
                required={!isJoin}
                minLength={2}
                maxLength={150}
                autoComplete="organization"
                value={form.companyName}
                onChange={set("companyName")}
                readOnly={isJoin}
                placeholder={isJoin ? "Retrouvé grâce au matricule fiscal" : undefined}
              />
              {isJoin && (
                <p id="lookup-status" className={`status-line ${lookup.state}`} role="status" aria-live="polite">
                  {lookup.state === "loading" && "Recherche de la société…"}
                  {lookup.state === "found" && `Société trouvée : ${lookup.companyName}.`}
                  {lookup.state === "notfound" && "Aucune société ne correspond à ce matricule fiscal. Vérifiez la saisie."}
                  {lookup.state === "error" && "La recherche est momentanément indisponible. Réessayez dans un instant."}
                </p>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>2. Votre accès</legend>
          <div className="grid">
            <div className="field full">
              <label htmlFor="email">E-mail professionnel</label>
              <input
                id="email"
                required
                type="email"
                maxLength={180}
                autoComplete="email"
                value={form.email}
                onChange={set("email")}
              />
              <p className="field-help">Vos identifiants y seront envoyés.</p>
            </div>

            <div className="field full">
              <label htmlFor="login">Login</label>
              <input
                id="login"
                required
                pattern="[A-Za-z0-9._\-]{4,40}"
                title="4 à 40 caractères : lettres, chiffres, point, tiret et tiret bas"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={form.login}
                onChange={set("login")}
              />
              <p className="field-help">4 à 40 caractères : lettres, chiffres, point, tiret, tiret bas.</p>
            </div>
          </div>
        </fieldset>

        <fieldset className="group">
          <legend>3. Votre formule</legend>
          <div className="plan-options">
            {PLANS.map((plan) => (
              <label key={plan.id} className={`plan-option${form.plan === plan.id ? " on" : ""}`}>
                <input
                  type="radio"
                  name="plan"
                  value={plan.id}
                  checked={form.plan === plan.id}
                  onChange={set("plan")}
                />
                <span className="plan-name">{plan.label}</span>
                <span className="plan-price num">{plan.price} <small>{plan.period}</small></span>
                <span className="plan-aud">{plan.audience}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {blockedByOffer && lookup.state === "found" && lookup.expiresOn && (
          <p className="alert" role="alert">
            Une offre est déjà active pour ce login jusqu’au{" "}
            {new Date(lookup.expiresOn).toLocaleDateString("fr-FR")}. Choisissez un autre login ou attendez son
            expiration.
          </p>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => {
              setAcceptedTerms(e.target.checked);
              if (e.target.checked) setError("");
            }}
          />
          <span>
            J’accepte les conditions générales d’utilisation et la politique de confidentialité. Je comprends que
            l’abonnement est souscrit pour le service de gestion des notes de frais et peut être résilié selon les
            modalités prévues dans le contrat.
          </span>
        </label>

        {error && <p className="alert" role="alert">{error}</p>}

        <button className="btn btn-primary btn-block btn-lg" disabled={!canSubmit}>
          {loading ? "Ouverture du paiement…" : `Payer ${selectedPlan.price} ${selectedPlan.period}`}
        </button>
        <p className="fineprint center">
          Vous serez redirigé vers la page de paiement sécurisée de Stripe.
        </p>
      </form>
    </div>
  );
}

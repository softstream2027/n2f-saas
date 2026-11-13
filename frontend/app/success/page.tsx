"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Brand from "@/components/Brand";
import { readJsonResponse, resolveApiBase } from "@/lib/api";

const ERP_URL = process.env.NEXT_PUBLIC_AXELOR_URL ?? "https://taysirflow.duckdns.org";
const POLL_MS = 4000;
const MAX_WAIT_MS = 10 * 60 * 1000;
const MAX_ERRORS = 5;

type StatusResponse = { status?: string; login?: string; email?: string; companyName?: string };
type StepState = "done" | "active" | "waiting";

function Step({ state, title, text }: { state: StepState; title: string; text: string }) {
  return (
    <li className={`flow-step ${state}`}>
      <span className="flow-dot" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
      <div>
        <p className="flow-title">{title}</p>
        <p className="flow-text">{text}</p>
      </div>
    </li>
  );
}

function SuccessContent() {
  const params = useSearchParams();
  const tenantId = params.get("tenantId");
  const apiUrl = resolveApiBase();

  const [status, setStatus] = useState("PROVISIONING");
  const [info, setInfo] = useState<{ login?: string; email?: string; companyName?: string }>({});
  const [stalled, setStalled] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let errors = 0;
    const startedAt = Date.now();

    const tick = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/signup/${encodeURIComponent(tenantId)}/status`, { cache: "no-store" });
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("status");
        const data = await readJsonResponse<StatusResponse>(res);
        errors = 0;
        setStatus(data.status ?? "PROVISIONING");
        if (data.login) setInfo({ login: data.login, email: data.email, companyName: data.companyName });
        if (data.status === "ACTIVE" || data.status === "FAILED") return;
      } catch {
        // Une coupure réseau ponctuelle ne doit pas arrêter le suivi.
        errors += 1;
        if (errors >= MAX_ERRORS) {
          setStalled(true);
          return;
        }
      }
      if (stopped) return;
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        setStalled(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [tenantId, apiUrl]);

  const isActive = status === "ACTIVE";
  const isFailed = status === "FAILED";
  const waitingPayment = status === "PENDING_PAYMENT";

  let body: React.ReactNode;

  if (!tenantId || notFound) {
    body = (
      <>
        <h1>Inscription introuvable</h1>
        <p className="lead">Le lien utilisé est incomplet ou n’est plus valable. Recommencez depuis la page d’accueil.</p>
        <a className="btn btn-primary" href="/#inscription">Créer mon espace</a>
      </>
    );
  } else if (isActive) {
    body = (
      <>
        <h1>Votre espace est prêt{info.companyName ? ` : ${info.companyName}` : ""}</h1>
        <p className="lead">Connectez-vous avec les identifiants ci-dessous.</p>
        <dl className="creds">
          <div><dt>Login</dt><dd className="num">{info.login ?? "—"}</dd></div>
          <div><dt>Mot de passe temporaire</dt><dd>Envoyé à {info.email ?? "votre adresse e-mail"}</dd></div>
        </dl>
        <p className="fineprint">Aucun e-mail ? Vérifiez vos courriers indésirables avant de contacter le support.</p>
        <div className="hero-actions">
          <a className="btn btn-primary" href={ERP_URL}>Accéder à mon ERP</a>
          <a className="btn btn-ghost" href="/dashboard">Voir l’aperçu du tableau de bord</a>
        </div>
      </>
    );
  } else if (isFailed) {
    body = (
      <>
        <h1>La création de votre espace n’a pas abouti</h1>
        <p className="lead">
          Votre paiement a bien été reçu, mais l’espace n’a pas pu être finalisé. Contactez le support en indiquant
          la référence ci-dessous : nous reprenons la création sans nouveau paiement.
        </p>
        <p className="ref">Référence <span className="num">{tenantId}</span></p>
        <a className="btn btn-ghost" href="/">Retour à l’accueil</a>
      </>
    );
  } else if (stalled) {
    body = (
      <>
        <h1>La création prend plus de temps que prévu</h1>
        <p className="lead">
          Votre espace est toujours en cours de préparation. Vous recevrez vos identifiants par e-mail dès qu’il est
          prêt. Vous pouvez aussi recharger cette page pour reprendre le suivi.
        </p>
        <p className="ref">Référence <span className="num">{tenantId}</span></p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Recharger le suivi</button>
      </>
    );
  } else {
    body = (
      <>
        <h1>{waitingPayment ? "Confirmation du paiement en cours" : "Nous créons votre espace"}</h1>
        <p className="lead">Gardez cette page ouverte : elle se met à jour toute seule. Comptez 1 à 2 minutes.</p>
        <ol className="flow" aria-live="polite">
          <Step
            state={waitingPayment ? "active" : "done"}
            title="Paiement"
            text={waitingPayment ? "En attente de la confirmation de Stripe." : "Paiement confirmé."}
          />
          <Step
            state={waitingPayment ? "waiting" : "active"}
            title="Société et comptabilité"
            text="Création de la société, du plan comptable et de l’exercice fiscal."
          />
          <Step state="waiting" title="Accès" text="Création de votre utilisateur et envoi des identifiants par e-mail." />
        </ol>
      </>
    );
  }

  return (
    <main className="focus-page">
      <div className="focus-card">
        <a href="/" aria-label="SoftStream, accueil"><Brand /></a>
        <div className="focus-body">{body}</div>
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="focus-page">
          <div className="focus-card"><p>Chargement…</p></div>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

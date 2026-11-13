import Brand from "@/components/Brand";
import PlanLink from "@/components/PlanLink";
import SignupFlow from "@/components/SignupFlow";
import { INCLUDED, PLANS } from "@/lib/plans";

const SETUP = [
  { label: "Création du compte", note: "Inscription en quelques minutes" },
  { label: "Saisie du profil", note: "Société, pays et informations fiscales" },
  { label: "Déclaration des frais", note: "Dépenses, justificatifs et montants" },
  { label: "Validation par le manager", note: "Suivi des demandes et approbation" },
  { label: "Remboursement", note: "Affectation et paiement finalisé" },
];

const MODULES = [
  { name: "Saisie rapide", text: "Créer une note de frais en quelques clics avec catégorie, montant, date, devise et justificatif associé." },
  { name: "Dépenses couvertes", text: "Avion, hôtel, parking, taxi, transport, internet, location, restaurant, téléphone, train, et autres frais professionnels." },
  { name: "Validation hiérarchique", text: "Suivre chaque demande, contrôler les montants et approuver ou refuser selon le workflow interne de votre organisation." },
  { name: "Suivi du budget", text: "Identifier les frais engagés, les remboursements en attente et la charge totale par collaborateur ou service." },
  { name: "Remboursement", text: "Finaliser le remboursement avec un historique clair, un statut visible et des pièces attachées à chaque demande." },
];

const TRUST = [
  { value: "+22 000", label: "entreprises" },
  { value: "4.7/5", label: "avis clients" },
  { value: "100%", label: "mobile" },
  { value: "20 jours", label: "d’essai" },
];

const CATEGORIES = [
  "Avion",
  "Hôtel",
  "Parking",
  "Taxi",
  "Transport",
  "Internet",
  "Location",
  "Restaurant",
  "Téléphone",
  "Train",
];

const FLOW_STEPS = [
  { title: "1. Saisie", text: "Le collaborateur crée sa dépense en quelques secondes avec justificatif et montant." },
  { title: "2. Validation", text: "Le manager vérifie les montants, les pièces jointes et les règles internes de l’entreprise." },
  { title: "3. Suivi", text: "Les frais sont suivis en temps réel avec état, historique et contrôles de cohérence." },
  { title: "4. Remboursement", text: "Le remboursement final est préparé proprement et visible pour tous les acteurs." },
];

const COMPARE = [
  { topic: "Démarrage", classic: "Formulaires papier, mails et relances manuelles", soft: "Flux digitalisé prêt à l’emploi après inscription" },
  { topic: "Saisie", classic: "Données réparties sur plusieurs supports", soft: "Une seule demande centralisée par note de frais" },
  { topic: "Validation", classic: "Suivi peu visible et approbation lente", soft: "Étapes claires, commentaires et historique" },
  { topic: "Remboursement", classic: "Calculs manuels et retards", soft: "Suivi simple des montants à rembourser" },
];

const FAQ = [
  {
    q: "Combien de temps faut-il pour démarrer ?",
    a: "L’inscription se fait rapidement et votre service de gestion des notes de frais est prêt à l’emploi dès la confirmation du paiement.",
  },
  {
    q: "Quels types de dépenses sont gérés ?",
    a: "Le service couvre les frais professionnels courants : avion, hôtel, parking, taxi, transport, internet, location, restaurant, téléphone, train et autres dépenses liées à l’activité.",
  },
  {
    q: "Comment se passe la validation ?",
    a: "Le manager ou responsable reçoit la demande, vérifie les montants, les justificatifs et les règles d’usage internes, puis valide ou refuse selon le workflow défini.",
  },
  {
    q: "Quelles sont les conditions d’utilisation et de résiliation ?",
    a: "L’utilisation du service est soumise aux conditions générales applicables au compte. L’abonnement ne peut être souscrit qu’après validation des conditions générales, et la résiliation est effectuée selon les modalités prévues dans le contrat et les règles de facturation convenues.",
  },
  {
    q: "Le paiement est-il sécurisé ?",
    a: "Oui. Le paiement est traité via Stripe sur une page sécurisée. Aucune donnée bancaire n’est stockée directement dans notre interface.",
  },
];

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="wrap bar">
          <a href="#top" aria-label="SoftStream, accueil"><Brand /></a>
          <nav className="nav" aria-label="Navigation principale">
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#comparatif">Comparatif</a>
            <a href="#tarifs">Tarifs</a>
            <a href="#questions">Questions</a>
          </nav>
          <a className="btn btn-primary btn-sm" href="#inscription">Créer mon espace</a>
        </div>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            <span className="eyebrow">Service de gestion des frais professionnels</span>
            <h1>Gérez vos notes de frais sans friction.</h1>
            <p className="lead">
              Centralisez la saisie, la validation et le remboursement des dépenses professionnelles de votre équipe,
              depuis un espace simple, rapide et 100 % pensé pour les entreprises qui veulent gagner du temps.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="#inscription">Essai gratuit</a>
              <a className="btn btn-ghost" href="#tarifs">Voir les tarifs</a>
            </div>
            <div className="trust-row" aria-label="Preuves sociales">
              {TRUST.map((item) => (
                <div key={item.label} className="trust-item">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <p className="fineprint">
            Paiement sécurisé par Stripe. Votre espace est prêt à l’usage dès validation des conditions générales.
          </p>
          </div>

          <figure className="ledger" aria-label="Le parcours de gestion de notes de frais">
            <figcaption className="ledger-title">Le parcours de remboursement</figcaption>
            <ul className="ledger-rows">
              {SETUP.map((row, i) => (
                <li key={row.label} style={{ ["--i" as string]: i }}>
                  <span className="tick" aria-hidden="true">✓</span>
                  <span className="ledger-label">{row.label}</span>
                  <span className="ledger-note">{row.note}</span>
                </li>
              ))}
            </ul>
            <div className="ledger-foot">
              <span>Temps moyen</span>
              <strong>2 à 4 minutes</strong>
            </div>
          </figure>
        </section>

        <section id="fonctionnalites" className="section wrap">
          <div className="section-head">
            <h2>Un service complet de gestion des notes de frais</h2>
            <p>Des catégories de dépenses claires, un workflow simple, et la conformité des règles internes dans un seul parcours.</p>
          </div>
          <div className="feature-band">
            <span>100 % mobile</span>
            <span>Validation hiérarchique</span>
            <span>Justificatifs attachés</span>
            <span>Suivi des remboursements</span>
          </div>
          <div className="category-grid" aria-label="Catégories de frais professionnels">
            {CATEGORIES.map((cat) => (
              <span key={cat} className="category-pill">{cat}</span>
            ))}
          </div>
          <dl className="ruled">
            {MODULES.map((m) => (
              <div className="ruled-row" key={m.name}>
                <dt>{m.name}</dt>
                <dd>{m.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="section wrap">
          <div className="section-head">
            <h2>Une expérience pensée pour le quotidien opérationnel</h2>
            <p>Chaque demande suit un parcours clair, traceable et adapté à la gestion des dépenses professionnelles.</p>
          </div>
          <div className="steps-grid">
            {FLOW_STEPS.map((step) => (
              <article key={step.title} className="step-card">
                <span className="step-index">{step.title}</span>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="comparatif" className="section wrap">
          <div className="section-head">
            <h2>Ce qui change face aux méthodes classiques</h2>
            <p>Plus de formulaires papier, moins de relances, et un contrôle plus simple sur les frais professionnels.</p>
          </div>
          <div className="table-scroll">
            <table className="compare">
              <caption className="sr-only">Comparaison entre un flux manuel et SoftStream</caption>
              <thead>
                <tr>
                  <th scope="col">Critère</th>
                  <th scope="col">Méthodes classiques</th>
                  <th scope="col" className="is-us">SoftStream</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.topic}>
                    <th scope="row">{r.topic}</th>
                    <td>{r.classic}</td>
                    <td className="is-us">{r.soft}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="tarifs" className="section wrap">
          <div className="section-head">
            <h2>Des tarifs affichés avant de commencer</h2>
            <p>Un service simple, transparent et pensé pour les entreprises qui souhaitent piloter leurs frais professionnels.</p>
          </div>
          <div className="pricing">
            {PLANS.map((plan) => (
              <article className="price-col" key={plan.id}>
                <h3>{plan.label}</h3>
                <p className="price-audience">{plan.audience}</p>
                <p className="price-amount">
                  <span className="num">{plan.price}</span> <small>{plan.period}</small>
                </p>
                <PlanLink planId={plan.id} className="btn btn-ghost btn-block">
                  Choisir {plan.label}
                </PlanLink>
              </article>
            ))}
          </div>
          <ul className="check-list inline-list">
            {INCLUDED.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </section>

        <section id="inscription" className="section wrap">
          <div className="section-head">
            <h2>Créez votre espace</h2>
            <p>Renseignez vos informations, acceptez les conditions générales, choisissez votre formule, puis activez votre service de gestion des notes de frais.</p>
          </div>
          <SignupFlow />
        </section>

        <section id="questions" className="section wrap narrow">
          <div className="section-head">
            <h2>Questions fréquentes</h2>
          </div>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap foot">
          <Brand light />
          <p>© {new Date().getFullYear()} SoftStream. Gestion des notes de frais.</p>
        </div>
      </footer>
    </>
  );
}

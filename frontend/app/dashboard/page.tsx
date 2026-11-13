import Brand from "@/components/Brand";

// Aperçu : données de démonstration, à remplacer par les données réelles de l'ERP.
const KPIS = [
  { label: "Dépenses du mois", value: "12 480", unit: "TND", note: "+12,4 % sur un mois" },
  { label: "En attente de validation", value: "18", unit: "notes", note: "dont 4 urgentes" },
  { label: "Taux de validation", value: "94", unit: "%", note: "+5,2 points" },
  { label: "À rembourser", value: "8 920", unit: "TND", note: "à payer ce mois-ci" },
];

const ROWS = [
  { name: "Transport", date: "12/11/2026", amount: "420", status: "approved" },
  { name: "Repas client", date: "09/11/2026", amount: "180", status: "pending" },
  { name: "Hébergement", date: "07/11/2026", amount: "730", status: "approved" },
  { name: "Télécom", date: "05/11/2026", amount: "120", status: "rejected" },
] as const;

const LABEL = { approved: "Validée", pending: "En attente", rejected: "Refusée" } as const;

const TASKS = [
  { label: "4 demandes à valider", who: "Responsable" },
  { label: "2 justificatifs incomplets", who: "Comptabilité" },
  { label: "Nouvelle formule active", who: "Administrateur" },
];

export default function DashboardPage() {
  const erp = process.env.NEXT_PUBLIC_AXELOR_URL ?? "https://taysirflow.duckdns.org";
  return (
    <>
      <header className="site-header">
        <div className="wrap bar">
          <a href="/" aria-label="SoftStream, accueil"><Brand /></a>
          <div className="bar-actions">
            <a className="btn btn-ghost btn-sm" href="/">Accueil</a>
            <a className="btn btn-primary btn-sm" href={erp}>Ouvrir l’ERP</a>
          </div>
        </div>
      </header>

      <main className="wrap dash">
        <div className="dash-head">
          <h1>Tableau de bord</h1>
          <p className="demo-note">Aperçu avec des données de démonstration.</p>
        </div>

        <section className="kpis" aria-label="Indicateurs">
          {KPIS.map((k) => (
            <div className="kpi" key={k.label}>
              <p className="kpi-label">{k.label}</p>
              <p className="kpi-value"><span className="num">{k.value}</span> <small>{k.unit}</small></p>
              <p className="kpi-note">{k.note}</p>
            </div>
          ))}
        </section>

        <div className="dash-grid">
          <section className="panel" aria-labelledby="t-notes">
            <h2 id="t-notes">Dernières notes de frais</h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Date</th>
                    <th scope="col" className="right">Montant (TND)</th>
                    <th scope="col">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={`${r.name}-${r.date}`}>
                      <th scope="row">{r.name}</th>
                      <td className="num">{r.date}</td>
                      <td className="num right">{r.amount}</td>
                      <td><span className={`chip ${r.status}`}>{LABEL[r.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel" aria-labelledby="t-todo">
            <h2 id="t-todo">À traiter</h2>
            <ul className="todo">
              {TASKS.map((t) => (
                <li key={t.label}>
                  <span>{t.label}</span>
                  <span className="muted">{t.who}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}

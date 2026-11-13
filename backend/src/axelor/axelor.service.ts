import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosInstance } from "axios";
import { cfg } from "../config";
import { shiroHashPassword } from "../core/shiro-hash";
import { generateTempPassword } from "../core/password";

type Json = Record<string, any>;

const M = {
  partner: "com.axelor.apps.base.db.Partner",
  company: "com.axelor.apps.base.db.Company",
  currency: "com.axelor.apps.base.db.Currency",
  user: "com.axelor.auth.db.User",
  group: "com.axelor.auth.db.Group",
  printingSettings: "com.axelor.apps.base.db.PrintingSettings",
  sequence: "com.axelor.apps.base.db.Sequence",
  hrConfig: "com.axelor.apps.hr.db.HRConfig",
  employee: "com.axelor.apps.hr.db.Employee",
  emailAddress: "com.axelor.message.db.EmailAddress",
  accountConfig: "com.axelor.apps.account.db.AccountConfig",
  account: "com.axelor.apps.account.db.Account",
};

// Configuration comptable figée (valeurs relevées dans l'interface Axelor)
const ACCOUNTING_IMPORT_ACTION = "action-account-config-group-import-account-config";
const ACCOUNTING_TEMPLATE_ID = 1; // « France - Plan Comptable Général »
const ACCOUNTING_TEMPLATE_FIELD = "accountingConfigTemplate";
const ACCOUNTING_GENERATE_FISCAL_YEAR = "Y"; // valeur envoyée par l'interface (case « Générer une année fiscale »)
const ACCOUNTING_PERIOD_DURATION = "month"; // « Un mois »
const ACCOUNTING_ACTION_TIMEOUT_MS = 300_000; // 5 min
const EMPLOYEE_ACCOUNT_CODE = "421000";
const EMPLOYEE_ACCOUNT_NAME = "Personnel - Rémunérations dues";

@Injectable()
export class AxelorService {
  private readonly log = new Logger(AxelorService.name);

  // Appels internes en HTTP (http://app:8080) : pas d'agent HTTPS nécessaire.
  private readonly http: AxiosInstance = axios.create({
    baseURL: cfg.axelor.baseUrl.replace(/\/$/, ""),
    timeout: 30_000,
    maxRedirects: 0,
    validateStatus: () => true,
  });

  // Authentification Basic "directe" (sans session ni CSRF).
  // Nécessite côté Axelor : auth.local.basic-auth = indirect, direct
  private async call(method: "GET" | "POST" | "PUT", url: string, data?: Json): Promise<Json[]> {
    const res = await this.http.request({
      method,
      url,
      data,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      auth: { username: cfg.axelor.username, password: cfg.axelor.password },
    });

    if (res.status >= 400 || res.data?.status !== 0) {
      const detail = res.data?.data?.message ?? res.data?.data?.title ?? "";
      throw new Error(`Axelor ${method} ${url} : HTTP ${res.status} ${String(detail).slice(0, 300)}`);
    }
    return res.data.data ?? [];
  }

  private async findId(model: string, field: string, value: string): Promise<number | null> {
    const rows = await this.call("POST", `/ws/rest/${model}/search`, {
      offset: 0,
      limit: 1,
      fields: ["id"],
      data: { operator: "and", criteria: [{ fieldName: field, operator: "=", value }] },
    });
    return rows[0]?.id ?? null;
  }

  private async findIdWhere(
    model: string,
    criteria: { fieldName: string; operator: string; value: any }[],
  ): Promise<number | null> {
    const rows = await this.call("POST", `/ws/rest/${model}/search`, {
      offset: 0,
      limit: 1,
      fields: ["id"],
      data: { operator: "and", criteria },
    });
    return rows[0]?.id ?? null;
  }

  private async create(model: string, data: Json): Promise<number> {
    const rows = await this.call("PUT", `/ws/rest/${model}`, { data });
    const id = rows[0]?.id;
    if (!id) throw new Error(`Création Axelor échouée pour ${model}`);
    this.log.log(`${model} créé (id=${id})`);
    return id;
  }

  async userExists(login: string) {
    return (await this.findId(M.user, "code", login)) !== null;
  }

  async userEmailExists(email: string) {
    return (await this.findId(M.user, "email", email)) !== null;
  }

  async findUser(login: string): Promise<{ id: number; activeCompanyId: number | null } | null> {
    const rows = await this.call("POST", `/ws/rest/${M.user}/search`, {
      offset: 0,
      limit: 1,
      fields: ["id", "activeCompany"],
      data: { operator: "and", criteria: [{ fieldName: "code", operator: "=", value: login }] },
    });
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, activeCompanyId: r.activeCompany?.id ?? r["activeCompany.id"] ?? null };
  }

  async findUserWithExpiry(login: string): Promise<{ id: number; activeCompanyId: number | null; expiresOn?: string | null } | null> {
    const rows = await this.call("POST", `/ws/rest/${M.user}/search`, {
      offset: 0,
      limit: 1,
      fields: ["id", "activeCompany", "expiresOn"],
      data: { operator: "and", criteria: [{ fieldName: "code", operator: "=", value: login }] },
    });
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      activeCompanyId: r.activeCompany?.id ?? r["activeCompany.id"] ?? null,
      expiresOn: r.expiresOn ?? r["expiresOn"] ?? null,
    };
  }

  findCompanyId(code: string) {
    return this.findId(M.company, "code", code);
  }

  async findCompanyByCodeOrName(code: string, name: string) {
    const byCode = await this.findId(M.company, "code", code);
    if (byCode) return byCode;
    return this.findId(M.company, "name", name);
  }

  async findCompanyByTaxId(taxId: string): Promise<{ id: number; name: string; country?: string } | null> {
    const companyId = await this.findIdWhere(M.company, [{ fieldName: "partner.taxNbr", operator: "=", value: taxId }]);
    if (!companyId) return null;
    const [company] = await this.call("GET", `/ws/rest/${M.company}/${companyId}`);
    if (!company) return null;
    const country =
      company.country ??
      company.mainAddress?.country ??
      company["mainAddress.country"] ??
      company.partner?.country ??
      company["partner.country"] ??
      undefined;
    return { id: company.id, name: company.name, country };
  }

  async findCompanyByCodeOrNameOrTaxId(code: string, name: string, taxId?: string) {
    const byCode = await this.findCompanyByCodeOrName(code, name);
    if (byCode) return byCode;
    if (!taxId) return null;
    return this.findIdWhere(M.company, [{ fieldName: "partner.taxNbr", operator: "=", value: taxId }]);
  }

  async printingSettingsId(name: string) {
    const id = await this.findId(M.printingSettings, "name", name);
    if (!id) throw new Error(`Paramètres d'impression "${name}" introuvables dans Axelor`);
    return id;
  }

  findExpenseSequenceId(companyId: number) {
    return this.findIdWhere(M.sequence, [
      { fieldName: "company.id", operator: "=", value: companyId },
      { fieldName: "codeSelect", operator: "=", value: "expense" },
    ]);
  }

  createExpenseSequence(input: { companyId: number; name: string; prefix: string; padding: number }) {
    return this.create(M.sequence, {
      name: input.name,
      codeSelect: "expense",
      company: { id: input.companyId },
      prefixe: input.prefix,
      padding: input.padding,
      toBeAdded: 1,
      yearlyResetOk: true,
      monthlyResetOk: false,
      prefixGroovyOk: false,
      suffixGroovyOk: false,
      sequenceTypeSelect: "NUMBERS",
      sequenceLettersTypeSelect: "UPPERCASE",
    });
  }

  findHrConfigId(companyId: number) {
    return this.findIdWhere(M.hrConfig, [{ fieldName: "company.id", operator: "=", value: companyId }]);
  }

  createHrConfig(input: {
    companyId: number;
    sequenceId: number;
    expenseReportTemplateId?: number;
    annualReportTemplateId?: number;
  }) {
    const data: Json = {
      company: { id: input.companyId },
      expenseSequence: { id: input.sequenceId },
    };
    if (input.expenseReportTemplateId) data.expenseReportPrintTemplate = { id: input.expenseReportTemplateId };
    if (input.annualReportTemplateId) data.employeeAnnualReportPrintTemplate = { id: input.annualReportTemplateId };
    return this.create(M.hrConfig, data);
  }

  createUserPartner(input: { name: string; emailAddressId: number; companyId?: number }) {
    const data: Json = {
      name: input.name,
      partnerTypeSelect: 2,
      isContact: false,
      emailAddress: { id: input.emailAddressId },
    };
    if (input.companyId) data.companySet = [{ id: input.companyId }];
    return this.create(M.partner, data);
  }
  // ---------------------------------------------------------------------------
  // Comptabilité d'une société
  // ---------------------------------------------------------------------------

  async findAccountingConfigId(companyId: number): Promise<number | null> {
    return this.findIdWhere(M.accountConfig, [{ fieldName: "company.id", operator: "=", value: companyId }]);
  }
  /** Crée la fiche AccountConfig (coquille vide) si elle n'existe pas. */
  async ensureAccountConfig(companyId: number): Promise<number> {
    const existing = await this.findAccountingConfigId(companyId);
    if (existing) return existing;
    return this.create(M.accountConfig, { company: { id: companyId } });
  }

  /** Vrai si le plan comptable est importé en entier : on teste la présence du compte salarié (421000). */
  async hasChartOfAccounts(companyId: number): Promise<boolean> {
    const byCompany = { fieldName: "company.id", operator: "=", value: companyId };
    const id =
      (await this.findIdWhere(M.account, [byCompany, { fieldName: "code", operator: "=", value: EMPLOYEE_ACCOUNT_CODE }])) ??
      (await this.findIdWhere(M.account, [byCompany, { fieldName: "name", operator: "=", value: EMPLOYEE_ACCOUNT_NAME }]));
    return id !== null;
  }

  /** Exécute une action serveur Axelor (bouton de formulaire). /ws/action répond 200 même en cas d'erreur métier. */
  private async runAction(model: string, action: string, context: Json): Promise<Json[]> {
    const res = await this.http.request({
      method: "POST",
      url: "/ws/action",
      data: { model, action, data: { context } },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      auth: { username: cfg.axelor.username, password: cfg.axelor.password },
      timeout: ACCOUNTING_ACTION_TIMEOUT_MS, // l'import du plan comptable dépasse 30 s
    });
    if (res.status >= 400 || res.data?.status !== 0) {
      const detail = res.data?.data?.message ?? res.data?.data?.title ?? "";
      throw new Error(`Axelor action ${action} : HTTP ${res.status} ${String(detail).slice(0, 300)}`);
    }
    const items: Json[] = Array.isArray(res.data?.data) ? res.data.data : [];
    for (const item of items) {
      if (item?.error) {
        const e = item.error;
        const msg = typeof e === "string" ? e : (e.message ?? e.title ?? JSON.stringify(e));
        throw new Error(`Axelor action ${action} : ${String(msg).slice(0, 400)}`);
      }
      if (item?.alert) {
        throw new Error(`Axelor action ${action} demande une confirmation : ${String(item.alert).slice(0, 300)}`);
      }
    }
    return items;
  }

  /**
   * Équivalent du bouton « Importer/Générer les configurations comptables » (formulaire AccountConfig) :
   * 1. enregistre sur l'AccountConfig le modèle, la génération d'exercice, les dates et la durée des périodes
   *    (POST /ws/rest/...AccountConfig, comme le fait l'interface avant l'action) ;
   * 2. exécute l'action du bouton, qui importe le plan comptable et génère exercice fiscal + périodes.
   */
  async importAccountingConfiguration(companyId: number): Promise<void> {
    const configId = await this.ensureAccountConfig(companyId);

    const year = new Date().getFullYear();
    const values: Json = {
      generateFiscalYear: ACCOUNTING_GENERATE_FISCAL_YEAR,
      fiscalYearFromDate: `${year}-01-01`,
      fiscalYearToDate: `${year}-12-31`,
      accountingPeriodDuration: ACCOUNTING_PERIOD_DURATION,
    };
    values[ACCOUNTING_TEMPLATE_FIELD] = { id: ACCOUNTING_TEMPLATE_ID };
    // Les champs « $... » du formulaire sont transitoires : envoyés aussi avec le préfixe $ dans le contexte de l'action.
    const transient: Json = {};
    for (const [k, v] of Object.entries(values)) transient[`$${k}`] = v;

    const [current] = await this.call("GET", `/ws/rest/${M.accountConfig}/${configId}`);
    if (!current) throw new Error(`AccountConfig ${configId} introuvable`);
    await this.call("POST", `/ws/rest/${M.accountConfig}/${configId}`, {
      data: { id: configId, version: current.version, ...values },
    });

    // L'action est une chaîne : une étape peut répondre { save: true, pending: "action[1]" }, ce qui signifie
    // « enregistre le formulaire, puis relance l'action indiquée ». L'enregistrement est déjà fait via REST ;
    // on relance donc chaque étape en attente avec la version à jour, jusqu'à la fin de la chaîne.
    const trace: Json[] = [];
    let action: string | undefined = ACCOUNTING_IMPORT_ACTION;
    for (let step = 0; action && step < 10; step++) {
      const [fresh] = await this.call("GET", `/ws/rest/${M.accountConfig}/${configId}`);
      const items = await this.runAction(M.accountConfig, action, {
        _model: M.accountConfig,
        id: configId,
        version: fresh?.version ?? current.version,
        company: { id: companyId },
        ...values,
        ...transient,
      });
      trace.push({ action, items });
      const next = items.find((it) => typeof it?.pending === "string")?.pending as string | undefined;
      action = next && next !== action ? next : undefined;
    }
    this.log.log(
      `Action ${ACCOUNTING_IMPORT_ACTION} exécutée pour la société ${companyId} : ${JSON.stringify(trace).slice(0, 800)}`,
    );
  }

  /** Renseigne AccountConfig.employeeAccount (requis pour créer une fiche Employé). */
  async ensureEmployeeAccount(companyId: number): Promise<void> {
    const configId = await this.findAccountingConfigId(companyId);
    if (!configId) throw new Error(`AccountConfig introuvable pour la société ${companyId}`);

    const [current] = await this.call("GET", `/ws/rest/${M.accountConfig}/${configId}`);
    if (current?.employeeAccount?.id) return;

    const byCompany = { fieldName: "company.id", operator: "=", value: companyId };
    const accountId =
      (await this.findIdWhere(M.account, [byCompany, { fieldName: "code", operator: "=", value: EMPLOYEE_ACCOUNT_CODE }])) ??
      (await this.findIdWhere(M.account, [byCompany, { fieldName: "name", operator: "=", value: EMPLOYEE_ACCOUNT_NAME }]));
    if (!accountId) {
      throw new Error(
        `Compte salarié "${EMPLOYEE_ACCOUNT_CODE}" introuvable pour la société ${companyId} (plan comptable non importé ?)`,
      );
    }

    await this.call("POST", `/ws/rest/${M.accountConfig}/${configId}`, {
      data: { id: configId, version: current.version, employeeAccount: { id: accountId } },
    });
    this.log.log(`Compte salarié ${EMPLOYEE_ACCOUNT_CODE} (id=${accountId}) défini pour la société ${companyId}`);
  }

  /** Comptabilité complète d'une société, idempotente : config, plan comptable + exercice, compte salarié. */
  async setupAccounting(companyId: number): Promise<void> {
    await this.ensureAccountConfig(companyId);
    if (!(await this.hasChartOfAccounts(companyId))) {
      await this.importAccountingConfiguration(companyId);
      if (!(await this.hasChartOfAccounts(companyId))) {
        throw new Error(`Import comptable exécuté mais aucun compte trouvé pour la société ${companyId}.`);
      }
    }
    await this.ensureEmployeeAccount(companyId);
  }

  async companyNameExists(name: string) {
    return (await this.findId(M.company, "name", name)) !== null;
  }

  async currencyId(codeISO: string) {
    const id = await this.findId(M.currency, "codeISO", codeISO);
    if (!id) throw new Error(`Devise ${codeISO} introuvable dans Axelor`);
    return id;
  }

  async groupId(code: string) {
    const id = await this.findId(M.group, "code", code);
    if (!id) throw new Error(`Groupe Axelor "${code}" introuvable`);
    return id;
  }

  createPartner(input: { name: string; taxId: string; companyId?: number }) {
    const data: Json = {
      name: input.name,
      partnerTypeSelect: 1,
      isContact: false,
      taxNbr: input.taxId,
    };
    if (input.companyId) data.companySet = [{ id: input.companyId }];
    return this.create(M.partner, data);
  }

  async getPartner(partnerId: number): Promise<{ companySet?: Array<{ id?: number }> } | null> {
    const [partner] = await this.call("GET", `/ws/rest/${M.partner}/${partnerId}`);
    return partner ?? null;
  }

  async updatePartnerCompanySet(partnerId: number, companyId: number) {
    const [current] = await this.call("GET", `/ws/rest/${M.partner}/${partnerId}`);
    if (!current) throw new Error(`Tiers Axelor ${partnerId} introuvable`);
    const companySet = Array.isArray(current.companySet)
      ? current.companySet.map((item: any) => ({ id: item?.id }))
      : [];
    if (!companySet.some((item: any) => item.id === companyId)) {
      companySet.push({ id: companyId });
    }

    try {
      await this.call("POST", `/ws/rest/${M.partner}/${partnerId}`, {
        data: { id: partnerId, version: current.version, companySet },
      });
    } catch (error: any) {
      const bodyMessage =
        error?.response?.data?.data?.message ??
        error?.response?.data?.message ??
        error?.response?.data?.title ??
        error?.message ??
        String(error);
      if (/informations comptables|accounting/i.test(bodyMessage)) {
        this.log.warn(
          `companySet non appliqué pour Partner ${partnerId} / Company ${companyId}: ${bodyMessage}`,
        );
        return;
      }
      throw error;
    }
  }

  createCompany(input: {
    name: string;
    code: string;
    partnerId: number;
    currencyId: number;
    printingSettingsId: number;
  }) {
    return this.create(M.company, {
      name: input.name,
      code: input.code,
      partner: { id: input.partnerId },
      currency: { id: input.currencyId },
      printingSettings: { id: input.printingSettingsId },
    });
  }

  // Fiche employé (RH) avec son contact
  createEmployee(input: {
    name: string;
    email: string;
    companyId: number;
    contactPartnerId: number;
    hrManager?: boolean; // responsable RH (création d'une nouvelle société)
    managerUserId?: number; // responsable hiérarchique (rattachement à une société existante)
  }) {
    const data: Json = {
      name: input.name,
      contactEmail: input.email,
      contactPartner: { id: input.contactPartnerId },
      mainEmploymentHistory: { company: { id: input.companyId } },
    };
    if (input.hrManager) data.hrManager = true;
    if (input.managerUserId) data.managerUser = { id: input.managerUserId };
    return this.create(M.employee, data);
  }

  /** Responsable d'une société : utilisateur actif de la société avec isBpmAdministrator = true. */
  async findCompanyManagerUserId(companyId: number): Promise<number | null> {
    return this.findIdWhere(M.user, [
      { fieldName: "activeCompany.id", operator: "=", value: companyId },
      { fieldName: "isBpmAdministrator", operator: "=", value: true },
      { fieldName: "blocked", operator: "=", value: false },
    ]);
  }

  // Création de l'utilisateur SANS e-mail Axelor : le modèle d'e-mail d'Axelor relit transientPassword
  // depuis la base (champ jamais enregistré) et ne peut donc pas contenir le mot de passe.
  // L'e-mail d'accès est envoyé par le backend (MailService) avec plainPassword.
  async createUser(input: {
    login: string;
    name: string;
    email: string;
    companyId: number;
    groupId: number;
    partnerId: number;
    employeeId?: number;
    isBpmAdministrator?: boolean;
    activateOn: string;
    expiresOn: string;
  }): Promise<{ userId: number; plainPassword: string }> {
    const plainPassword = generateTempPassword(16);
    const hashedPassword = shiroHashPassword(plainPassword);

    const data: Json = {
      code: input.login,
      name: input.name,
      email: input.email,
      language: "fr",
      group: { id: input.groupId },
      activeCompany: { id: input.companyId },
      companySet: [{ id: input.companyId }],
      blocked: false,
      statusSelect: 1,
      stepStatusSelect: 5, // utilisateur "activé et terminé"
      partner: { id: input.partnerId },
      activateOn: input.activateOn,
      expiresOn: input.expiresOn,
      password: hashedPassword,
      transientPassword: plainPassword,
      sendEmailUponPasswordChange: false, // aucun e-mail Axelor : envoi par le backend
      change: true,
      forcePasswordChange: true,
    };

    if (input.employeeId) {
      data.employee = { id: input.employeeId };
    }
    if (input.isBpmAdministrator) {
      data.isBpmAdministrator = true;
    }

    const rows = await this.call("PUT", `/ws/rest/${M.user}`, { data });
    const userId = rows[0]?.id;
    if (!userId) throw new Error(`Création Axelor échouée pour ${M.user}`);

    this.log.log(`${M.user} créé (id=${userId})`);
    return { userId, plainPassword };
  }

  // Lier l'employé à l'utilisateur après création
  async setUserEmployee(userId: number, employeeId: number) {
    const [current] = await this.call("GET", `/ws/rest/${M.user}/${userId}`);
    if (!current) throw new Error(`Utilisateur Axelor ${userId} introuvable`);
    await this.call("POST", `/ws/rest/${M.user}/${userId}`, {
      data: { id: userId, version: current.version, employee: { id: employeeId } },
    });
  }

  async setUserAccess(userId: number, patch: { blocked?: boolean; expiresOn?: string }) {
    const [current] = await this.call("GET", `/ws/rest/${M.user}/${userId}`);
    if (!current) throw new Error(`Utilisateur Axelor ${userId} introuvable`);
    const data: Json = { id: userId, version: current.version };
    if (patch.blocked !== undefined) data.blocked = patch.blocked;
    if (patch.expiresOn !== undefined) data.expiresOn = patch.expiresOn;
    await this.call("POST", `/ws/rest/${M.user}/${userId}`, { data });
  }

  async setUserBlocked(userId: number, blocked: boolean) {
    return this.setUserAccess(userId, { blocked });
  }

  createEmailAddress(address: string) {
    return this.create(M.emailAddress, { address });
  }
}
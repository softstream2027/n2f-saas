import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { cfg } from "../config";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly transporter = cfg.smtp.host
    ? nodemailer.createTransport({
        host: cfg.smtp.host,
        port: cfg.smtp.port,
        secure: cfg.smtp.port === 465,
        auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
        connectionTimeout: 15_000,
        socketTimeout: 20_000,
      })
    : null;

  /**
   * Adresse PUBLIQUE de l'ERP à mettre dans l'e-mail.
   * Attention : cfg.axelor.baseUrl est l'adresse INTERNE Docker (http://app:8080), inutilisable par un client.
   */
  private erpUrl(): string {
    return process.env.AXELOR_PUBLIC_URL ?? process.env.NEXT_PUBLIC_AXELOR_URL ?? cfg.axelor.baseUrl;
  }

  /**
   * E-mail d'accès à l'ERP. Si `password` est fourni (mot de passe temporaire généré par le backend),
   * il est inclus : l'utilisateur devra le changer à sa première connexion.
   * Ne lève jamais d'exception : renvoie true si l'e-mail est parti, false sinon.
   * Le mot de passe n'est jamais écrit dans les journaux.
   */
  async sendWelcome(to: string, companyName: string, login: string, password?: string): Promise<boolean> {
    if (!this.transporter) {
      this.log.warn("SMTP non configuré : e-mail d'accès ignoré.");
      return false;
    }

    const url = this.erpUrl();
    const passwordHtml = password
      ? `<p>Mot de passe temporaire : <strong style="font-family:monospace">${esc(password)}</strong><br>
         Vous devrez choisir un nouveau mot de passe à votre première connexion.</p>`
      : `<p>Mot de passe : celui choisi lors de l'inscription.</p>`;
    const passwordText = password
      ? `Mot de passe temporaire : ${password}\nVous devrez choisir un nouveau mot de passe à votre première connexion.`
      : `Mot de passe : celui choisi lors de l'inscription.`;

    try {
      await this.transporter.sendMail({
        from: cfg.smtp.from,
        to,
        subject: "Votre espace SoftStream est prêt",
        text: [
          "Bonjour,",
          "",
          `L'espace de ${companyName} est prêt.`,
          "",
          `Adresse : ${url}`,
          `Identifiant : ${login}`,
          passwordText,
          "",
          "Ne partagez jamais ce message.",
        ].join("\n"),
        html: `<p>Bonjour,</p>
          <p>L'espace de <strong>${esc(companyName)}</strong> est prêt.</p>
          <p>Identifiant : <strong>${esc(login)}</strong></p>
          ${passwordHtml}
          <p><a href="${esc(url)}">Accéder à mon ERP</a></p>
          <p style="color:#666;font-size:12px">Ne partagez jamais ce message.</p>`,
      });
      this.log.log(`E-mail d'accès envoyé à ${to}`);
      return true;
    } catch (e: any) {
      this.log.error(`Envoi e-mail échoué : ${e?.message}`);
      return false;
    }
  }
}

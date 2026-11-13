import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../core/prisma.service";

@Injectable()
export class ProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue("provisioning") private readonly queue: Queue,
  ) {}

  /**
   * Met un provisionnement en file. L'identifiant de job BullMQ est déterministe : un webhook rejoué
   * ou un double appel ne crée jamais deux jobs pour le même tenant.
   */
  async enqueueProvision(tenantId: string) {
// 1. Cr�er le job en base de donn�es (tra�abilit�)
    const jobKey = `provision-${tenantId}`;

    const existing = await this.queue.getJob(jobKey);
    if (existing) {
      if ((await existing.isFailed()) || (await existing.isCompleted())) {
        await existing.remove(); // nouvelle tentative volontaire (reprise manuelle)
      } else {
        return (existing.data as { jobId?: string }).jobId ?? existing.id; // déjà en attente ou en cours
      }
    }

    const job = await this.prisma.provisioningJob.create({
      data: {
        tenantId,
        status: "QUEUED",
        payload: { tenantId, requestedAt: new Date().toISOString() },
      },
    });

    // 2. Ajouter � la file d'attente BullMQ
    await this.queue.add(
      "provision-tenant",
      { jobId: job.id, tenantId },
      {
        jobId: jobKey,
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    );

    return job.id;
  }

  /** Alias conservé pour le code existant. */
  async enqueueTenant(tenantId: string) {
    return this.enqueueProvision(tenantId);
  }

// M�thode pour g�rer la suspension/r�activation
  /**
   * Demande la synchronisation de l'accès Axelor (bloqué / débloqué) d'après le statut ACTUEL du tenant.
   * Le paramètre `enable` n'est conservé que pour la traçabilité : le worker relit l'état en base.
   */
  async enqueueAccess(tenantId: string, enable: boolean) {
    await this.queue.add(
      "manage-access",
      { tenantId, enable },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: { age: 7 * 86_400 },
      },
    );
  }
}

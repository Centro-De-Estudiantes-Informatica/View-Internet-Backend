import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entity: 'User' | 'Payment' | 'Setting' | 'ExchangeRate';
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

/** Registro de auditoría; se escribe dentro de la misma transacción que el cambio. */
@Injectable()
export class AuditService {
  async log(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: entry });
  }
}

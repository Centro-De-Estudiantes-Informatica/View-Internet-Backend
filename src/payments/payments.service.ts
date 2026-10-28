import { Injectable, Logger } from '@nestjs/common';
import { Currency, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PeriodsService } from '../billing/periods.service';
import { addMonths, dateOnly } from '../common/domain/period';
import { Decimal, money } from '../common/domain/money';
import { conflict, notFound, unprocessable } from '../common/errors/business-error';
import { PrismaService } from '../prisma/prisma.service';
import { detectImageType, RECEIPT_EXTENSION } from '../storage/image-type';
import { ReceiptStorage } from '../storage/receipt-storage';
import type {
  CashPaymentDto,
  ListPaymentsQuery,
  MobilePaymentDto,
  PaymentDto,
  PaymentPageDto,
  ReceiptUrlDto,
} from './dto/payments.dto';
import { PaymentCalculator } from './payment-calculator.service';
import { PAYMENT_USER_SELECT, toPaymentDto } from './payment.mapper';

/** Cuántos meses por adelantado se permite pagar. */
const MAX_MONTHS_AHEAD = 12;
const RECEIPT_URL_TTL_SECONDS = 300;

export interface UploadedReceipt {
  buffer: Buffer;
  size: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PeriodsService,
    private readonly billing: BillingService,
    private readonly calculator: PaymentCalculator,
    private readonly storage: ReceiptStorage,
    private readonly audit: AuditService,
  ) {}

  /** Efectivo registrado por un ADMIN: cualquier moneda, queda APROBADO. */
  async registerCash(dto: CashPaymentDto, actorId: string): Promise<PaymentDto> {
    const paidAt = dto.paidAt ?? this.periods.today();
    this.billing.assertNotFuture(paidAt);
    this.assertPeriodInRange(dto.periodo);
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw notFound('USER_NOT_FOUND', 'La persona no existe');

    const amount = new Decimal(dto.amount);
    const calc = await this.calculator.calculate(dto.currency, amount, paidAt);
    const payment = await this.prisma.$transaction(async (tx) => {
      await this.periods.ensure(dto.periodo, tx);
      const created = await tx.payment.create({
        data: {
          userId: dto.userId,
          periodId: dto.periodo,
          method: PaymentMethod.EFECTIVO,
          currency: dto.currency,
          amount,
          rate: calc.ratePerUsd,
          rateDate: calc.rateDate ? dateOnly(calc.rateDate) : null,
          amountUsd: calc.amountUsd,
          status: PaymentStatus.APROBADO,
          paidAt: dateOnly(paidAt),
          note: dto.note ?? null,
          registeredById: actorId,
        },
        include: { user: PAYMENT_USER_SELECT },
      });
      await this.audit.log(tx, {
        actorId,
        action: 'PAYMENT_CASH_REGISTERED',
        entity: 'Payment',
        entityId: created.id,
        after: paymentAudit(created),
      });
      return created;
    });
    return toPaymentDto(payment);
  }

  /** Pago móvil reportado por el estudiante: solo VES, queda EN_REVISION. */
  async reportMobile(
    userId: string,
    dto: MobilePaymentDto,
    receipt?: UploadedReceipt,
  ): Promise<PaymentDto> {
    if (dto.currency && dto.currency !== Currency.VES) {
      throw unprocessable('MOBILE_PAYMENT_VES_ONLY', 'El pago móvil solo se acepta en bolívares');
    }
    this.billing.assertNotFuture(dto.paidAt);
    const periodId = dto.periodo ?? this.periods.current();
    this.assertPeriodInRange(periodId);

    const receiptType = receipt ? detectImageType(receipt.buffer) : null;
    if (receipt && !receiptType) {
      throw unprocessable('INVALID_RECEIPT', 'La captura debe ser una imagen JPG o PNG');
    }
    await this.assertReferenceAvailable(dto.bank, dto.reference);

    const amount = new Decimal(dto.amount);
    const calc = await this.calculator.calculate(Currency.VES, amount, dto.paidAt);

    let receiptKey: string | null = null;
    if (receipt && receiptType) {
      receiptKey = `receipts/${userId}/${randomUUID()}.${RECEIPT_EXTENSION[receiptType]}`;
      await this.storage.put(receiptKey, receipt.buffer, receiptType);
    }

    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        await this.periods.ensure(periodId, tx);
        const created = await tx.payment.create({
          data: {
            userId,
            periodId,
            method: PaymentMethod.PAGO_MOVIL,
            currency: Currency.VES,
            amount,
            rate: calc.ratePerUsd,
            rateDate: calc.rateDate ? dateOnly(calc.rateDate) : null,
            amountUsd: calc.amountUsd,
            status: PaymentStatus.EN_REVISION,
            reference: dto.reference,
            bank: dto.bank,
            payerPhone: dto.payerPhone,
            paidAt: dateOnly(dto.paidAt),
            receiptKey,
            registeredById: userId,
          },
          include: { user: PAYMENT_USER_SELECT },
        });
        await this.audit.log(tx, {
          actorId: userId,
          action: 'PAYMENT_MOBILE_REPORTED',
          entity: 'Payment',
          entityId: created.id,
          after: paymentAudit(created),
        });
        return created;
      });
      return toPaymentDto(payment);
    } catch (err) {
      if (receiptKey) await this.discardReceipt(receiptKey);
      // Carrera con otro reporte simultáneo: lo detiene el índice único parcial.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw duplicateReference();
      }
      throw err;
    }
  }

  approve(id: string, actorId: string, note?: string): Promise<PaymentDto> {
    return this.transition(id, actorId, PaymentStatus.EN_REVISION, 'PAYMENT_APPROVED', {
      status: PaymentStatus.APROBADO,
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewNote: note ?? null,
    });
  }

  reject(id: string, actorId: string, reason: string): Promise<PaymentDto> {
    return this.transition(id, actorId, PaymentStatus.EN_REVISION, 'PAYMENT_REJECTED', {
      status: PaymentStatus.RECHAZADO,
      reviewedById: actorId,
      reviewedAt: new Date(),
      reviewNote: reason,
    });
  }

  void(id: string, actorId: string, reason: string): Promise<PaymentDto> {
    return this.transition(id, actorId, PaymentStatus.APROBADO, 'PAYMENT_VOIDED', {
      status: PaymentStatus.ANULADO,
      voidedById: actorId,
      voidedAt: new Date(),
      voidReason: reason,
    });
  }

  async list(query: ListPaymentsQuery): Promise<PaymentPageDto> {
    const where: Prisma.PaymentWhereInput = {
      status: query.status,
      periodId: query.periodo,
      userId: query.userId,
      method: query.method,
      currency: query.currency,
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: { user: PAYMENT_USER_SELECT },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toPaymentDto), total, page: query.page, pageSize: query.pageSize };
  }

  async listForUser(userId: string): Promise<PaymentDto[]> {
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      include: { user: PAYMENT_USER_SELECT },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toPaymentDto);
  }

  async receiptUrl(id: string): Promise<ReceiptUrlDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { receiptKey: true },
    });
    if (!payment) throw paymentNotFound();
    if (!payment.receiptKey) throw notFound('RECEIPT_NOT_FOUND', 'El pago no tiene captura');
    return {
      url: await this.storage.signedUrl(payment.receiptKey, RECEIPT_URL_TTL_SECONDS),
      expiresIn: RECEIPT_URL_TTL_SECONDS,
    };
  }

  /**
   * Cambio de estado condicional (`UPDATE … WHERE status = from`): si otro administrador ya lo
   * cambió, no se afecta ninguna fila y se responde 409.
   */
  private async transition(
    id: string,
    actorId: string,
    from: PaymentStatus,
    action: string,
    data: Prisma.PaymentUncheckedUpdateManyInput,
  ): Promise<PaymentDto> {
    const payment = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({ where: { id, status: from }, data });
      if (count === 0) {
        const current = await tx.payment.findUnique({ where: { id }, select: { status: true } });
        if (!current) throw paymentNotFound();
        throw conflict(
          'INVALID_PAYMENT_STATE',
          `El pago está ${current.status}; solo se puede cambiar un pago ${from}`,
        );
      }
      const updated = await tx.payment.findUniqueOrThrow({
        where: { id },
        include: { user: PAYMENT_USER_SELECT },
      });
      await this.audit.log(tx, {
        actorId,
        action,
        entity: 'Payment',
        entityId: id,
        before: { status: from },
        after: {
          status: updated.status,
          reviewNote: updated.reviewNote,
          voidReason: updated.voidReason,
        },
      });
      return updated;
    });
    return toPaymentDto(payment);
  }

  private async assertReferenceAvailable(bank: string, reference: string): Promise<void> {
    const taken = await this.prisma.payment.findFirst({
      where: {
        bank,
        reference,
        status: { in: [PaymentStatus.EN_REVISION, PaymentStatus.APROBADO] },
      },
      select: { id: true },
    });
    if (taken) throw duplicateReference();
  }

  private assertPeriodInRange(periodId: string): void {
    if (periodId > addMonths(this.periods.current(), MAX_MONTHS_AHEAD)) {
      throw unprocessable(
        'INVALID_PERIOD',
        `Solo se puede pagar hasta ${MAX_MONTHS_AHEAD} meses por adelantado`,
      );
    }
  }

  private async discardReceipt(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(`No se pudo borrar la captura huérfana ${key}: ${String(err)}`);
    }
  }
}

function duplicateReference() {
  return conflict(
    'DUPLICATE_REFERENCE',
    'Ya existe un pago con esa referencia y banco en revisión o aprobado',
  );
}

function paymentNotFound() {
  return notFound('PAYMENT_NOT_FOUND', 'El pago no existe');
}

function paymentAudit(p: {
  userId: string;
  periodId: string;
  method: string;
  currency: string;
  amount: Decimal;
  rate: Decimal;
  amountUsd: Decimal;
  status: string;
  reference: string | null;
  bank: string | null;
}): Prisma.InputJsonObject {
  return {
    userId: p.userId,
    periodo: p.periodId,
    method: p.method,
    currency: p.currency,
    amount: money(p.amount),
    rate: p.rate.toFixed(4),
    amountUsd: money(p.amountUsd),
    status: p.status,
    reference: p.reference,
    bank: p.bank,
  };
}

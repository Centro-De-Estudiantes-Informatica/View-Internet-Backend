import { registerDecorator, ValidationOptions } from 'class-validator';
import { Decimal } from '../domain/money';

/**
 * Valida un monto decimal enviado como string (`"1000.00"`), mayor que cero y con hasta
 * `maxDecimals` decimales. Los montos nunca viajan como number para no perder precisión.
 */
export function IsPositiveDecimalString(
  maxDecimals: number,
  maxIntegerDigits: number,
  options?: ValidationOptions,
) {
  const pattern = new RegExp(`^\\d{1,${maxIntegerDigits}}(\\.\\d{1,${maxDecimals}})?$`);
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isPositiveDecimalString',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} debe ser un decimal positivo en texto con hasta ${maxDecimals} decimales`,
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && pattern.test(value) && new Decimal(value).gt(0),
      },
    });
}

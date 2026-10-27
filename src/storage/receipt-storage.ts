/** Almacenamiento privado de capturas de pago móvil. */
export abstract class ReceiptStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** URL firmada de solo lectura con vencimiento corto. */
  abstract signedUrl(key: string, expiresInSeconds: number): Promise<string>;
  abstract delete(key: string): Promise<void>;
}

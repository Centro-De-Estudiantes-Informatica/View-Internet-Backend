import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { AppConfig } from '../config/app-config.service';

// Sin caracteres ambiguos (0/O, 1/l/I).
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_LENGTH = 10;

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  constructor(private readonly config: AppConfig) {}

  hash(password: string): Promise<string> {
    return hash(password, this.config.get('BCRYPT_COST'));
  }

  verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }

  /** Compara contra un hash ficticio para que una cédula inexistente tarde lo mismo. */
  async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= this.hash('dummy-password-for-timing');
    await compare(password, await this.dummyHash);
    return false;
  }

  temporary(): string {
    return Array.from(
      { length: TEMP_LENGTH },
      () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)],
    ).join('');
  }
}

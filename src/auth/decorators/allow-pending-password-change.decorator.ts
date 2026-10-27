import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE = 'allowPendingPasswordChange';

/** Ruta permitida aunque la cuenta tenga `mustChangePassword`. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

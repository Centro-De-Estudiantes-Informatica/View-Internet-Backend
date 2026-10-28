import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Ruta accesible sin token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** S3 client bound to the internal (compose network) storage endpoint. */
export const STORAGE_S3_CLIENT = Symbol('STORAGE_S3_CLIENT');

/**
 * S3 client bound to the browser-reachable storage endpoint. Used only to
 * sign URLs — the signature covers the host, so it must be the public one.
 */
export const STORAGE_PRESIGN_S3_CLIENT = Symbol('STORAGE_PRESIGN_S3_CLIENT');

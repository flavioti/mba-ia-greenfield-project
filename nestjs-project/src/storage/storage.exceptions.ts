/**
 * Storage-level failures. They are transport-agnostic: the videos domain
 * translates them into its own Error Catalog codes.
 */
export class MultipartUploadNotFoundException extends Error {
  constructor(key: string) {
    super(`Multipart upload not found for key ${key}`);
    this.name = 'MultipartUploadNotFoundException';
  }
}

export class InvalidMultipartPartsException extends Error {
  constructor(reason: string) {
    super(`Storage rejected the multipart part list: ${reason}`);
    this.name = 'InvalidMultipartPartsException';
  }
}

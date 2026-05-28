/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'otpauth' {
  export class Secret {
    static fromBase32(str: string): Secret;
  }
  export class TOTP {
    constructor(opts: {
      secret: Secret;
      algorithm?: string;
      digits?: number;
      period?: number;
    });
    secret: Secret;
    algorithm: string;
    digits: number;
    period: number;
    generate(): string;
  }
}

declare module 'jsqr' {
  interface QRCode {
    data: string;
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    opts?: { inversionAttempts?: string }
  ): QRCode | null;
}

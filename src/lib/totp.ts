import * as OTPAuth from 'otpauth';

export function generateTOTP(account: {
  secret: string;
  algorithm?: string;
  digits?: number;
  period?: number;
}): { token: string; remaining: number } {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(account.secret.replace(/\s/g, '').toUpperCase()),
    algorithm: (account.algorithm as any) || 'SHA1',
    digits: account.digits || 6,
    period: account.period || 30,
  });

  const token = totp.generate();
  const remaining = totp.period - (Math.floor(Date.now() / 1000) % totp.period);

  return { token, remaining };
}

export function parseOTPAuthURL(url: string): {
  label: string;
  issuer: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
} | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'otpauth:') return null;

    const path = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    const [issuerFromPath, labelFromPath] = path.includes(':')
      ? path.split(':')
      : ['', path];

    const params = parsed.searchParams;
    const secret = params.get('secret');
    if (!secret) return null;

    return {
      label: labelFromPath || 'Unknown',
      issuer: params.get('issuer') || issuerFromPath || 'Unknown',
      secret,
      algorithm: params.get('algorithm') || 'SHA1',
      digits: parseInt(params.get('digits') || '6', 10),
      period: parseInt(params.get('period') || '30', 10),
    };
  } catch {
    return null;
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';

type AccessPayload = {
  sub: string;
  purpose?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AccessPayload): Promise<AuthUser> {
    if (payload.purpose === 'receipt') {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.isActive) throw new UnauthorizedException();
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}

export function accessExpires(config: ConfigService): JwtSignOptions['expiresIn'] {
  return (config.get<string>('JWT_EXPIRES_IN') || '12h') as JwtSignOptions['expiresIn'];
}

export function receiptExpires(config: ConfigService): JwtSignOptions['expiresIn'] {
  return (config.get<string>('RECEIPT_TOKEN_EXPIRES_IN') || '12h') as JwtSignOptions['expiresIn'];
}

export function signAccessToken(jwt: JwtService, config: ConfigService, user: AuthUser) {
  return jwt.signAsync(
    { sub: user.id, email: user.email, role: user.role, purpose: 'access' },
    { expiresIn: accessExpires(config) },
  );
}

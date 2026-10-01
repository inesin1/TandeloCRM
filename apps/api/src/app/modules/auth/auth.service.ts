import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { PublicUser } from '../users/user.entity';
import { JwtPayload } from './jwt.strategy';
import { PermissionsService } from '../access-control/permissions.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<PublicUser | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return null;
    }

    if (!user.isActive) {
      return null;
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  login(user: PublicUser) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return { accessToken: this.jwtService.sign(payload) };
  }

  async getMe(userId: number) {
    const user = await this.usersService.findOne(String(userId));
    const permissions = await this.permissionsService.getEffectivePermissions(
      userId,
    );
    return { user, permissions };
  }
}

import { Injectable } from '@nestjs/common';
import type { UserDto, UserSyncInput } from '@mos/contracts';
import { AppException } from '../common/errors/app-exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const toUserDto = (user: User): UserDto => ({
  id: user.id,
  login: user.login,
  avatarUrl: user.avatarUrl,
});

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(input: UserSyncInput): Promise<UserDto> {
    const user = await this.prisma.user.upsert({
      where: { githubId: input.githubId },
      // Explicit fields: a future contract field must not flow into Prisma unnoticed.
      create: { githubId: input.githubId, login: input.login, avatarUrl: input.avatarUrl },
      update: { login: input.login, avatarUrl: input.avatarUrl },
    });
    return toUserDto(user);
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppException('NOT_FOUND', 'User not found');
    return toUserDto(user);
  }
}

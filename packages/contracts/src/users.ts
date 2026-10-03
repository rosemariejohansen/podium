import { z } from 'zod';

export const userSyncSchema = z.strictObject({
  githubId: z.string().min(1).max(64),
  login: z.string().min(1).max(39),
  avatarUrl: z.url({ protocol: /^https$/ }).nullable(),
});
export type UserSyncInput = z.output<typeof userSyncSchema>;

export interface UserDto {
  id: string;
  login: string;
  avatarUrl: string | null;
}

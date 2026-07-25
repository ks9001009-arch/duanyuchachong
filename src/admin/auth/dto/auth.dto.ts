import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  oldPassword!: string;

  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  newPassword!: string;
}

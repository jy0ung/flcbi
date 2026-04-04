import {
  type AppRole,
  type CreateAdminUserRequest,
  type UpdateAdminUserRequest,
  type UserStatus,
} from "@flcbi/contracts";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from "class-validator";

const ADMIN_ROLES: AppRole[] = [
  "super_admin",
  "company_admin",
  "director",
  "general_manager",
  "manager",
  "sales",
  "accounts",
  "analyst",
];

const USER_STATUSES: UserStatus[] = [
  "active",
  "pending",
  "disabled",
];

function normalizeOptionalBranchId(value: unknown) {
  if (value === "" || value === null) {
    return null;
  }
  return value;
}

export class CreateAdminUserDto implements CreateAdminUserRequest {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: ADMIN_ROLES })
  @IsIn(ADMIN_ROLES)
  role!: AppRole;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }) => normalizeOptionalBranchId(value))
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  branchId?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;
}

export class UpdateAdminUserDto implements UpdateAdminUserRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ADMIN_ROLES })
  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: AppRole;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => normalizeOptionalBranchId(value))
  @ValidateIf((_object, value) => value !== null && value !== undefined)
  @IsUUID()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: USER_STATUSES })
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: UserStatus;
}

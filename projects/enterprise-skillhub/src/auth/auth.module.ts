import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { createLdapClientFactory } from './strategies/ldap.strategy';
import { RolesGuard } from './guards/roles.guard';
import { DepartmentVisibilityGuard } from './guards/department-visibility.guard';
import { ConfigService } from '../config/config.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: { expiresIn: configService.jwtExpiresIn },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    DepartmentVisibilityGuard,
    {
      provide: 'LDAP_CLIENT_FACTORY',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createLdapClientFactory(configService),
    },
  ],
  exports: [AuthService, JwtStrategy, RolesGuard, DepartmentVisibilityGuard],
})
export class AuthModule {}

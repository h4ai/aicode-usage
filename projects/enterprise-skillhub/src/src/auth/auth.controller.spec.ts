import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

// ============================================================
// TDD — RED Phase: All tests written BEFORE implementation
// ============================================================

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;

  const mockUser = {
    id: 'user-001',
    username: 'jdoe',
    displayName: 'John Doe',
    email: 'jdoe@example.com',
    department: 'Engineering',
    role: 'PUBLISHER',
    isActive: true,
  };

  const mockLoginResult = {
    accessToken: 'mock-jwt-token',
    user: mockUser,
  };

  const mockAuthService = {
    login: jest.fn(),
    validateToken: jest.fn(),
    getProfile: jest.fn(),
    logout: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const request = context.switchToHttp().getRequest();
          // Simulate authenticated user if Authorization header present
          if (request.headers.authorization === 'Bearer valid-token') {
            request.user = { sub: 'user-001', role: 'PUBLISHER', department: 'Engineering' };
            return true;
          }
          return false;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 200 with JWT token for valid credentials', async () => {
      mockAuthService.login.mockResolvedValue(mockLoginResult);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'jdoe', password: 'correct-password' })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('jdoe');
      expect(mockAuthService.login).toHaveBeenCalledWith('jdoe', 'correct-password');
    });

    it('should return 401 for wrong password', async () => {
      mockAuthService.login.mockRejectedValue(
        new (require('@nestjs/common').UnauthorizedException)({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'jdoe', password: 'wrong-password' })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body).toHaveProperty('code', 'AUTH_INVALID_CREDENTIALS');
      expect(response.body).toHaveProperty('statusCode', 401);
    });

    it('should return 400 for missing username', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ password: 'some-password' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for missing password', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'jdoe' })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user profile with valid token', async () => {
      mockAuthService.getProfile.mockResolvedValue(mockUser);

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('username', 'jdoe');
      expect(response.body).toHaveProperty('role', 'PUBLISHER');
      expect(response.body).toHaveProperty('department', 'Engineering');
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(HttpStatus.FORBIDDEN); // Guard returns false → 403
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should return 200 on successful logout', async () => {
      mockAuthService.logout.mockResolvedValue({ message: 'Logged out successfully' });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer valid-token')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });
  });
});

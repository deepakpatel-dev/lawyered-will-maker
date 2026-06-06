/**
 * SPEC: AuthService
 *
 * Behaviour contract:
 *  - register() hashes the password before saving (never stores plain text)
 *  - register() throws ConflictException when email is already taken
 *  - register() returns a signed JWT + user shape on success
 *  - login() throws UnauthorizedException for unknown email
 *  - login() throws UnauthorizedException for wrong password
 *  - login() returns a signed JWT + user shape on success
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '', // filled per test
  createdAt: new Date(),
  updatedAt: new Date(),
  wills: [],
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock.jwt.token') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('throws ConflictException if email already exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser as any);
      await expect(
        service.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes the password before saving', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation(async (email, hash) => ({
        ...mockUser,
        email,
        passwordHash: hash,
      }));

      await service.register({ email: 'new@example.com', password: 'password123' });

      const [, savedHash] = usersService.create.mock.calls[0];
      const isHashed = await bcrypt.compare('password123', savedHash);
      expect(isHashed).toBe(true);
    });

    it('returns accessToken and user on success', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...mockUser, email: 'new@example.com' } as any);

      const result = await service.register({ email: 'new@example.com', password: 'password123' });
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.email).toBe('new@example.com');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for unknown email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'unknown@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const hash = await bcrypt.hash('correct_password', 12);
      usersService.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hash } as any);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns accessToken and user for valid credentials', async () => {
      const hash = await bcrypt.hash('correct_password', 12);
      usersService.findByEmail.mockResolvedValue({ ...mockUser, passwordHash: hash } as any);

      const result = await service.login({ email: 'test@example.com', password: 'correct_password' });
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.user.id).toBe(mockUser.id);
    });
  });
});

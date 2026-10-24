import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { UsersService } from '../users/users.service';
import { CopilotActionsService } from './copilot-actions.service';
import { CopilotController } from './copilot.controller';
import { CopilotProvider } from './copilot-provider';
import { CopilotSettingsService } from './copilot-settings.service';
import { PermissionsService } from '../access-control/permissions.service';
import { PermissionsGuard } from '../access-control/permissions.guard';
import { CopilotRunnerService } from './copilot-runner.service';
import { CopilotService } from './copilot.service';
import { CopilotToolsService } from './copilot-tools.service';

describe('Copilot authenticated Nest flow', () => {
  const secret = 'integration-only-secret';
  let module: TestingModule;
  let jwt: JwtService;
  const copilotService = {
    getStatus: vi.fn(() => ({ enabled: true, capabilities: { conversations: true } })),
    listConversations: vi.fn((userId: number) => ({ items: [{ id: 7, userId }], nextCursor: null })),
  };
  const users = {
    findActiveById: vi.fn(async (id: number) => id === 7 ? { id, email: 'e2e@example.test' } : null),
  };
  const provider = {
    getConfiguration: vi.fn().mockResolvedValue({ enabled: true, model: 'test-model', baseUrl: 'https://api.openai.com/v1', apiFormat: 'responses' }),
    generate: vi.fn().mockResolvedValue({
      text: '{"text":"Deterministic answer","sourceIds":[]}',
      functionCalls: [],
      responseItems: [],
    }),
  };
  const tools = {
    definitions: vi.fn().mockResolvedValue([]),
    selectedSources: vi.fn().mockReturnValue([]),
    permissionsStillGranted: vi.fn().mockResolvedValue(true),
  };
  const actions = { definitions: vi.fn().mockResolvedValue([]) };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [PassportModule.register({ session: false }), JwtModule.register({ secret })],
      controllers: [CopilotController],
      providers: [
        JwtAuthGuard,
        JwtStrategy,
        CopilotRunnerService,
        { provide: CopilotService, useValue: copilotService },
        { provide: CopilotProvider, useValue: provider },
        { provide: CopilotSettingsService, useValue: { getPublic: vi.fn().mockResolvedValue({ enabled: true }) } },
        { provide: PermissionsService, useValue: { getEffectivePermissions: vi.fn().mockResolvedValue([]) } },
        { provide: CopilotToolsService, useValue: tools },
        { provide: CopilotActionsService, useValue: actions },
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? secret : true } },
        { provide: UsersService, useValue: users },
      ],
    }).compile();
    jwt = module.get(JwtService);
    vi.clearAllMocks();
  });

  afterEach(async () => module.close());

  it('runs the real JWT guard and strategy before calling the controller with the verified actor', async () => {
    const guard = module.get(JwtAuthGuard);
    const controller = module.get(CopilotController);
    const contextFor = (req: Record<string, unknown>) => ({
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
      getHandler: () => CopilotController.prototype.listConversations,
      getClass: () => CopilotController,
    }) as unknown as ExecutionContext;

    await expect(guard.canActivate(contextFor({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);

    const request = {
      headers: { authorization: `Bearer ${jwt.sign({ sub: 7, email: 'forged@example.test' })}` },
    };
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    await controller.listConversations({ limit: 20 }, request as never);
    expect(users.findActiveById).toHaveBeenCalledWith(7);
    expect(copilotService.listConversations).toHaveBeenCalledWith(7, { limit: 20 });

    const inactive = {
      headers: { authorization: `Bearer ${jwt.sign({ sub: 8, email: 'inactive@example.test' })}` },
    };
    await expect(guard.canActivate(contextFor(inactive))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses a deterministic provider through the Nest runner providers', async () => {
    const runner = module.get(CopilotRunnerService);
    const complete = vi.fn().mockResolvedValue(true);
    const fail = vi.fn();

    runner.launch(
      'run-fake-provider', 7, [{ role: 'user', content: 'question' }], 'prompt', new Date(Date.now() + 60_000),
      { serverNow: new Date(), canStart: async () => true, complete, fail },
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith({
      text: 'Deterministic answer', sources: [], requiredPermissions: [],
    }));

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
  });

  it('protects all configuration and probe endpoints with the admin capability', async () => {
    const permissions = module.get(PermissionsService);
    const permissionGuard = new PermissionsGuard(module.get(Reflector), permissions);
    for (const handler of [CopilotController.prototype.getSettings, CopilotController.prototype.saveSettings, CopilotController.prototype.testSettings]) {
      const context = {
        switchToHttp: () => ({ getRequest: () => ({ user: { sub: 7 } }) }),
        getHandler: () => handler, getClass: () => CopilotController,
      } as unknown as ExecutionContext;
      vi.mocked(permissions.getEffectivePermissions).mockResolvedValueOnce([]);
      await expect(permissionGuard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      vi.mocked(permissions.getEffectivePermissions).mockResolvedValueOnce(['users:write']);
      await expect(permissionGuard.canActivate(context)).resolves.toBe(true);
    }
  });
});

import { Express, Request, Response } from 'express';
import { RedisClient } from '../utils/redis';
import { ApiRateLimiterConfig, RateLimitRule } from '../types';
import { validateApiKeyEndpoint, validateRuleEndpoint } from '../middleware/validation';
import {
  CreateRuleRequestSchema,
  ResetParamsSchema,
  ResetResponseSchema,
  RuleParamsSchema,
  RuleResponseSchema,
} from '../utils/schemas';
import { getErrorMessage, sendError } from '../utils/httpErrors';
import { ERROR_CODES } from '../utils/errorCodes';
import { log } from '../utils/logger';

export interface RegisterRuleRoutesOptions {
  appConfig: ApiRateLimiterConfig;
  redis: RedisClient;
}

export function registerRuleRoutes(app: Express, options: RegisterRuleRoutesOptions): void {
  const { appConfig, redis } = options;

  app.post('/rules', validateRuleEndpoint(CreateRuleRequestSchema, undefined, RuleResponseSchema), (req: Request, res: Response) => {
    try {
      const incomingRule: RateLimitRule = req.body;
      const existingIndex = appConfig.rules.findIndex((rule) => rule.id === incomingRule.id);

      let savedRule: RateLimitRule;
      if (existingIndex >= 0) {
        appConfig.rules[existingIndex] = incomingRule;
        savedRule = appConfig.rules[existingIndex];
      } else {
        savedRule = {
          ...incomingRule,
          id: incomingRule.id || `rule-${Date.now()}`,
        };
        appConfig.rules.push(savedRule);
      }

      return res.json({
        message: 'Rule added/updated successfully',
        rule: {
          id: savedRule.id,
          name: savedRule.name,
          pattern: savedRule.pattern,
          method: savedRule.method,
          config: savedRule.config,
          enabled: savedRule.enabled,
          priority: savedRule.priority,
          description: (savedRule as RateLimitRule & { description?: string }).description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      return sendError(res, req, 500, 'Failed to add/update rule', getErrorMessage(error), {
        code: ERROR_CODES.RULES.UPSERT_FAILED,
      });
    }
  });

  app.delete('/rules/:ruleId', validateRuleEndpoint(undefined, RuleParamsSchema, RuleResponseSchema), (req: Request, res: Response) => {
    try {
      const { ruleId } = (req as Request & { validatedParams?: { ruleId: string } }).validatedParams || req.params;
      const index = appConfig.rules.findIndex((rule) => rule.id === ruleId);

      if (index === -1) {
        return sendError(res, req, 404, 'Rule not found', `Rule with ID '${ruleId}' does not exist`, {
          code: ERROR_CODES.RULES.NOT_FOUND,
        });
      }

      appConfig.rules.splice(index, 1);
      return res.json({
        message: 'Rule deleted successfully',
        rule: undefined,
      });
    } catch (error) {
      return sendError(res, req, 500, 'Failed to delete rule', getErrorMessage(error), {
        code: ERROR_CODES.RULES.DELETE_FAILED,
      });
    }
  });

  app.post('/reset/:key', validateApiKeyEndpoint(undefined, undefined, ResetParamsSchema, ResetResponseSchema), async (req: Request, res: Response): Promise<void> => {
    try {
      const paramsData = (req as Request & { validatedParams?: { key: string } }).validatedParams || req.params;
      const { key } = paramsData;
      const currentWindowStart = Math.floor(Date.now() / 60000) * 60000;

      await Promise.all([
        redis.del(key),
        redis.del(`tb:${key}`),
        redis.del(`sw:${key}`),
        redis.del(`fw:${key}`),
        redis.del(`${key}:${currentWindowStart}`),
        redis.del(`fw:${key}:${currentWindowStart}`),
      ]);

      res.json({
        message: 'Rate limit reset successfully',
        key,
        success: true,
      });
    } catch (error) {
      log.system('Rate limit reset error', {
        error: getErrorMessage(error),
        endpoint: req.path,
        method: req.method,
      });
      sendError(res, req, 500, 'Internal Server Error', getErrorMessage(error), {
        code: ERROR_CODES.RATE_LIMIT.RESET_FAILED,
      });
    }
  });
}

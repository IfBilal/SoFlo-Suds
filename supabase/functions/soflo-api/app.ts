import { Router } from './router.ts';
import { accountRoutes } from './account.ts';
import { customerRoutes } from './customer.ts';
import { adminRoutes } from './admin.ts';

export function buildRouter(): Router {
  const app = new Router();
  accountRoutes(app); customerRoutes(app); adminRoutes(app);
  return app;
}
/** `/functions/v1/soflo-api/vehicles` -> `/vehicles` */
export const routePath = (req: Request) => new URL(req.url).pathname.replace(/^\/(?:functions\/v1\/)?soflo-api/, '') || '/';

import { productionDeps } from '../_shared/runtime.ts';
import { Router } from '../soflo-api/router.ts';
import { loginRoutes } from '../soflo-api/login.ts';
import { routePath } from '../soflo-api/app.ts';

// Public by design (nobody is logged in yet): only the rate-limited login route lives here.
const router = new Router();
loginRoutes(router);
let deps: ReturnType<typeof productionDeps> | undefined;
Deno.serve((req) => router.handle(req, (deps ??= productionDeps()), routePath(req)));

import { productionDeps } from '../_shared/runtime.ts';
import { buildRouter, routePath } from './app.ts';

const router = buildRouter();
let deps: ReturnType<typeof productionDeps> | undefined;
Deno.serve((req) => router.handle(req, (deps ??= productionDeps()), routePath(req)));

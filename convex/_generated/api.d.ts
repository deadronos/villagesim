/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as functions_applyNpcAction from "../functions/applyNpcAction.js";
import type * as functions_assignPlanToNpc from "../functions/assignPlanToNpc.js";
import type * as functions_createTownForUser from "../functions/createTownForUser.js";
import type * as queries_getTown from "../queries/getTown.js";
import type * as queries_npcsNeedingDecision from "../queries/npcsNeedingDecision.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "functions/applyNpcAction": typeof functions_applyNpcAction;
  "functions/assignPlanToNpc": typeof functions_assignPlanToNpc;
  "functions/createTownForUser": typeof functions_createTownForUser;
  "queries/getTown": typeof queries_getTown;
  "queries/npcsNeedingDecision": typeof queries_npcsNeedingDecision;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

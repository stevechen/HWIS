/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as backup from "../backup.js";
import type * as categories from "../categories.js";
import type * as classes from "../classes.js";
import type * as createUser from "../createUser.js";
import type * as dataFactory from "../dataFactory.js";
import type * as dedupeLocalUsers from "../dedupeLocalUsers.js";
import type * as dedupeUsers from "../dedupeUsers.js";
import type * as driveBackup from "../driveBackup.js";
import type * as evaluations from "../evaluations.js";
import type * as houseEvents from "../houseEvents.js";
import type * as http from "../http.js";
import type * as listUsers from "../listUsers.js";
import type * as onboarding from "../onboarding.js";
import type * as recoverAuth from "../recoverAuth.js";
import type * as resetDb from "../resetDb.js";
import type * as seedAdmin from "../seedAdmin.js";
import type * as students from "../students.js";
import type * as testCleanup from "../testCleanup.js";
import type * as testData_weeklyReports from "../testData/weeklyReports.js";
import type * as testE2E from "../testE2E.js";
import type * as testFunction from "../testFunction.js";
import type * as testSetup from "../testSetup.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  backup: typeof backup;
  categories: typeof categories;
  classes: typeof classes;
  createUser: typeof createUser;
  dataFactory: typeof dataFactory;
  dedupeLocalUsers: typeof dedupeLocalUsers;
  dedupeUsers: typeof dedupeUsers;
  driveBackup: typeof driveBackup;
  evaluations: typeof evaluations;
  houseEvents: typeof houseEvents;
  http: typeof http;
  listUsers: typeof listUsers;
  onboarding: typeof onboarding;
  recoverAuth: typeof recoverAuth;
  resetDb: typeof resetDb;
  seedAdmin: typeof seedAdmin;
  students: typeof students;
  testCleanup: typeof testCleanup;
  "testData/weeklyReports": typeof testData_weeklyReports;
  testE2E: typeof testE2E;
  testFunction: typeof testFunction;
  testSetup: typeof testSetup;
  users: typeof users;
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

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};

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
import type * as clearJwks from "../clearJwks.js";
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
import type * as shared_authorization from "../shared/authorization.js";
import type * as shared_backup_snapshot from "../shared/backup_snapshot.js";
import type * as shared_class_roster from "../shared/class_roster.js";
import type * as shared_enrichment from "../shared/enrichment.js";
import type * as shared_evaluation_read_model from "../shared/evaluation_read_model.js";
import type * as shared_evaluation_utils from "../shared/evaluation_utils.js";
import type * as shared_evaluation_week from "../shared/evaluation_week.js";
import type * as shared_houses from "../shared/houses.js";
import type * as shared_migration_plan from "../shared/migration_plan.js";
import type * as shared_recentActions from "../shared/recentActions.js";
import type * as shared_restore_plan from "../shared/restore_plan.js";
import type * as shared_student from "../shared/student.js";
import type * as shared_weekly_report_read_model from "../shared/weekly_report_read_model.js";
import type * as students from "../students.js";
import type * as testAuth from "../testAuth.js";
import type * as testData_weeklyReports from "../testData/weeklyReports.js";
import type * as testE2E from "../testE2E.js";
import type * as testLifecycle from "../testLifecycle.js";
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
  clearJwks: typeof clearJwks;
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
  "shared/authorization": typeof shared_authorization;
  "shared/backup_snapshot": typeof shared_backup_snapshot;
  "shared/class_roster": typeof shared_class_roster;
  "shared/enrichment": typeof shared_enrichment;
  "shared/evaluation_read_model": typeof shared_evaluation_read_model;
  "shared/evaluation_utils": typeof shared_evaluation_utils;
  "shared/evaluation_week": typeof shared_evaluation_week;
  "shared/houses": typeof shared_houses;
  "shared/migration_plan": typeof shared_migration_plan;
  "shared/recentActions": typeof shared_recentActions;
  "shared/restore_plan": typeof shared_restore_plan;
  "shared/student": typeof shared_student;
  "shared/weekly_report_read_model": typeof shared_weekly_report_read_model;
  students: typeof students;
  testAuth: typeof testAuth;
  "testData/weeklyReports": typeof testData_weeklyReports;
  testE2E: typeof testE2E;
  testLifecycle: typeof testLifecycle;
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

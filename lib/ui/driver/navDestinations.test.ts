// lib/ui/driver/navDestinations.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canReachDestination, defaultLandingPath } from "./navDestinations.ts";

test("home dashboard has the same audience as the driver Planner", () => {
  const cases: [Parameters<typeof canReachDestination>[1], boolean, boolean][] = [
    ["driver", false, false], ["lead", false, false], ["admin", false, false],
    ["dispatch", false, false], ["admin", true, false], ["admin", false, true], [null, false, false],
  ];
  for (const [role, superAdmin, solo] of cases) {
    assert.equal(
      canReachDestination("home", role, superAdmin, solo),
      canReachDestination("planner", role, superAdmin, solo),
      `role=${role} superAdmin=${superAdmin} solo=${solo}`,
    );
  }
  assert.equal(canReachDestination("home", "driver", false), true);
  assert.equal(canReachDestination("home", "dispatch", false), false);
  assert.equal(canReachDestination("home", "admin", false, true), true, "solo admin is a driver");
});

test("each role lands on its own dashboard", () => {
  assert.equal(defaultLandingPath("driver", false), "/planner/home");
  assert.equal(defaultLandingPath("lead", false), "/planner/home");
  assert.equal(defaultLandingPath("dispatch", false), "/planner/dispatch");
  assert.equal(defaultLandingPath("admin", false), "/admin");
  assert.equal(defaultLandingPath("admin", false, true), "/planner/home"); // solo driver
  assert.equal(defaultLandingPath("admin", true), null); // super admin is never redirected
});

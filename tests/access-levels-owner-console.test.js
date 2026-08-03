import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import {
  ACCESS_LEVELS,
  VIEWER_ACCESS,
  accessForRole,
  businessModeForMembers,
  canAccess,
} from "../assets/js/domain/access-levels.js";

test("three operational levels map to progressively stronger capabilities", () => {
  assert.deepEqual(ACCESS_LEVELS.map((item) => item.level), [1, 2, 3]);
  assert.deepEqual(ACCESS_LEVELS.map((item) => item.role), ["operator", "manager", "owner"]);
  assert.equal(accessForRole("viewer"), VIEWER_ACCESS);
  assert.equal(canAccess("operator", "create_orders"), true);
  assert.equal(canAccess("operator", "manage_prices"), false);
  assert.equal(canAccess("manager", "manage_prices"), true);
  assert.equal(canAccess("manager", "manage_access"), false);
  assert.equal(canAccess("owner", "manage_access"), true);
});

test("single-person and team modes are derived without inventing extra users", () => {
  assert.equal(businessModeForMembers([{ is_active: true }]), "solo");
  assert.equal(businessModeForMembers([{ is_active: true }, { is_active: false }]), "solo");
  assert.equal(businessModeForMembers([{ is_active: true }, { is_active: true }]), "team");
});

test("owner console exposes business, customer preview and server-backed team controls", async () => {
  const [html, app, css, backend, urls, netlify, worker] = await Promise.all([
    readFile(new URL("../dueno.html", import.meta.url), "utf8"),
    readFile(new URL("../assets/js/owner/app.js", import.meta.url), "utf8"),
    readFile(new URL("../assets/css/owner.css", import.meta.url), "utf8"),
    readFile(new URL("../backend/market/team_api.py", import.meta.url), "utf8"),
    readFile(new URL("../backend/market/urls.py", import.meta.url), "utf8"),
    readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
    readFile(new URL("../sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="owner-business-form"/);
  assert.match(html, /id="customer-preview"/);
  assert.match(html, /id="team-list"/);
  assert.match(html, /Vista del dueño/);
  assert.match(html, /Vista del cliente/);
  assert.match(app, /apiRequest\("team\/"\)/);
  assert.match(app, /method:\s*"PATCH"/);
  assert.match(app, /activeRole\(\) === "owner"/);
  assert.match(backend, /Membership\.Role\.OWNER/);
  assert.match(backend, /al menos una cuenta dueña activa/i);
  assert.match(backend, /membership\.access_updated/);
  assert.match(urls, /team\/<uuid:membership_id>/);
  assert.match(netlify, /from = "\/dueno"[\s\S]*to = "\/dueno\.html"/);
  assert.match(worker, /\/dueno\.html/);
  assert.match(css, /min-height:\s*52px/);
});

test("owner and access scripts pass syntax validation", () => {
  execFileSync(process.execPath, ["--check", "assets/js/domain/access-levels.js"]);
  execFileSync(process.execPath, ["--check", "assets/js/owner/app.js"]);
});

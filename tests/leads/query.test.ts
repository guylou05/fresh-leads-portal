import { describe, expect, it } from "vitest";
import {
  buildLeadOrderBy,
  buildLeadWhere,
  normalizePageSize,
  parseLeadFilters,
  sanitizeFilters,
} from "@/lib/leads/query";

describe("filter parsing + whitelisting", () => {
  it("keeps only known keys with values", () => {
    const filters = parseLeadFilters({
      q: "acme",
      status: "NEW",
      bogus: "x",
      empty: "",
    });
    expect(filters.q).toBe("acme");
    expect(filters.status).toBe("NEW");
    expect("bogus" in filters).toBe(false);
  });

  it("sanitizeFilters drops unsupported keys from stored JSON", () => {
    const filters = sanitizeFilters({
      county: "Franklin",
      __proto__: "x",
      dropMe: 5,
      status: "QUALIFIED",
    });
    expect(filters).toEqual({ county: "Franklin", status: "QUALIFIED" });
  });
});

describe("buildLeadWhere", () => {
  it("excludes archived leads by default", () => {
    const json = JSON.stringify(buildLeadWhere({}));
    expect(json).toContain('"NOT"');
    expect(json).toContain('"ARCHIVED"');
  });

  it("status NEW includes profile-less records", () => {
    const json = JSON.stringify(buildLeadWhere({ status: "NEW" }));
    expect(json).toContain('"is":null');
    expect(json).toContain('"status":"NEW"');
  });

  it("status QUALIFIED requires a matching profile", () => {
    const json = JSON.stringify(buildLeadWhere({ status: "QUALIFIED" }));
    expect(json).toContain('"status":"QUALIFIED"');
    expect(json).not.toContain('"is":null');
  });

  it("unassigned matches null profile or null assignee", () => {
    const json = JSON.stringify(buildLeadWhere({ unassigned: "1" }));
    expect(json).toContain('"assignedToId":null');
  });

  it("missing email includes profile-less records", () => {
    const json = JSON.stringify(buildLeadWhere({ hasEmail: "missing" }));
    expect(json).toContain('"primaryEmail":null');
  });

  it("include shows archived (no archive exclusion)", () => {
    const json = JSON.stringify(buildLeadWhere({ archived: "include" }));
    expect(json).not.toContain('"NOT"');
  });

  it("archived=only shows only archived", () => {
    const json = JSON.stringify(buildLeadWhere({ archived: "only" }));
    expect(json).toContain('"status":"ARCHIVED"');
  });

  it("tag filter uses a some() relation", () => {
    const json = JSON.stringify(buildLeadWhere({ tags: "t1,t2" }));
    expect(json).toContain('"some"');
    expect(json).toContain("t1");
  });
});

describe("sorting + pagination", () => {
  it("maps sort options", () => {
    expect(buildLeadOrderBy("name_asc")).toEqual({ businessName: "asc" });
    expect(buildLeadOrderBy("priority_desc")).toEqual({
      leadProfile: { priority: "desc" },
    });
    expect(buildLeadOrderBy(undefined)).toEqual({ effectiveDate: "desc" });
  });

  it("clamps page size to an allowed option", () => {
    expect(normalizePageSize("50")).toBe(50);
    expect(normalizePageSize("999")).toBe(25);
    expect(normalizePageSize(undefined)).toBe(25);
  });
});

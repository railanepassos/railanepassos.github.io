import { describe, expect, it } from "vitest";
import {
  MAX_PEOPLE,
  MAX_PERSON_LENGTH,
  collectPeople,
  dedupePeople,
  normalizePerson,
  personKey,
} from "../../src/links/people";

// Fake names only (LGPD): none of these refers to a real person.
describe("people helpers", () => {
  it("normalizePerson strips @, trims, collapses spaces, keeps case and accents", () => {
    expect(normalizePerson("  @Maria   Clara ")).toBe("Maria Clara");
    expect(normalizePerson("@@João")).toBe("João");
    expect(normalizePerson("   ")).toBe("");
    expect(normalizePerson("x".repeat(100))).toHaveLength(MAX_PERSON_LENGTH);
  });

  it("personKey ignores case, accents and spacing differences", () => {
    expect(personKey("João  Silva")).toBe(personKey("@joao silva"));
    expect(personKey("Ana")).not.toBe(personKey("Ana Maria"));
  });

  it("dedupePeople drops blanks and duplicates by key; first display wins", () => {
    expect(dedupePeople(["Ana Teste", "ana  teste", "", "@João", "Joao"])).toEqual(["Ana Teste", "João"]);
  });

  it("collectPeople lists names most used first", () => {
    const links = [{ people: ["Ana Teste", "Bia"] }, { people: ["bia"] }, { people: null }, {}];
    expect(collectPeople(links)).toEqual(["Bia", "Ana Teste"]);
  });

  it("limits match the database", () => {
    expect(MAX_PEOPLE).toBe(30);
    expect(MAX_PERSON_LENGTH).toBe(80);
  });
});

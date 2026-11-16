import { describe, expect, it } from "vitest";
import {
  MAX_PEOPLE,
  MAX_PERSON_LENGTH,
  collectPeople,
  dedupePeople,
  hasAllPeople,
  normalizePerson,
  personKey,
  togglePersonKey,
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

  it("hasAllPeople is an AND over keys and passes with no filter", () => {
    const link = { people: ["Maria Clara", "Bia"] };
    expect(hasAllPeople(link, [])).toBe(true);
    expect(hasAllPeople(link, [personKey("maria clara")])).toBe(true);
    expect(hasAllPeople(link, [personKey("maria clara"), personKey("zed")])).toBe(false);
    expect(hasAllPeople({ people: null }, [personKey("bia")])).toBe(false);
  });

  it("togglePersonKey adds then removes", () => {
    expect(togglePersonKey([], "Maria Clara")).toEqual([personKey("Maria Clara")]);
    expect(togglePersonKey([personKey("Maria Clara")], "maria clara")).toEqual([]);
  });

  it("limits match the database", () => {
    expect(MAX_PEOPLE).toBe(30);
    expect(MAX_PERSON_LENGTH).toBe(80);
  });
});

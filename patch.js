const fs = require('fs');
const file = 'tests/unit/townPresentation.unit.test.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  '    expect(titleizeTownId("lantern-hollow")).toBe("Lantern Hollow");\n',
  ''
);

const newTests = `
  describe("titleizeTownId", () => {
    it("titleizes normal hyphenated ids", () => {
      expect(titleizeTownId("lantern-hollow")).toBe("Lantern Hollow");
      expect(titleizeTownId("super-cool-town")).toBe("Super Cool Town");
    });

    it("handles single words", () => {
      expect(titleizeTownId("hollow")).toBe("Hollow");
    });

    it("handles empty strings", () => {
      expect(titleizeTownId("")).toBe("");
    });

    it("handles consecutive hyphens", () => {
      expect(titleizeTownId("lantern--hollow")).toBe("Lantern Hollow");
    });

    it("handles leading and trailing hyphens", () => {
      expect(titleizeTownId("-lantern-hollow-")).toBe("Lantern Hollow");
    });

    it("preserves existing capitalization in parts", () => {
      expect(titleizeTownId("lANtern-Hollow")).toBe("LANtern Hollow");
    });
  });
`;

content = content.replace(
  /describe\("town presentation helpers", \(\) => \{\n/,
  `describe("town presentation helpers", () => {${newTests}\n`
);

fs.writeFileSync(file, content);

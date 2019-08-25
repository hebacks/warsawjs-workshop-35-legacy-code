import {
  multiply,
  countLines_globalSeam,
  countLines_parameterSeam
} from "../src/example";
import { expect } from "chai";

describe("multiply", () => {
  it("multiplies two numbers", () => {
    expect(multiply(5, 4)).to.equal(20);
  });
});

describe("countLines", () => {
  it("#countLines_globalSeam returns 3 for 3 line file", () => {
    global.fileContent = "a\nb\nc";
    const fileName = "file.txt";

    const result = countLines_globalSeam(fileName);

    expect(global.fileName).to.equal(fileName);
    expect(result).to.equal(3);
  });

  it("#countLines_parameterSeam returns 3 for 3 line file", () => {
    const fileContent = "a\nb\nc";
    const fileName = "file.txt";
    let param;

    function readFile(fileName) {
      param = fileName;
      return fileContent;
    }

    const result = countLines_parameterSeam(fileName, readFile);

    expect(param).to.equal(fileName);
    expect(result).to.equal(3);
  });
});
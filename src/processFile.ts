
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { translate, diffTranslate } from "./llm";
import { PotentialError } from "./parsejson";

export default async function processSingleFile(
  doc: vscode.TextDocument,
  diffString?: string
): Promise<void> {
  
  vscode.window.showInformationMessage(
    `Transforming ${path.basename(doc.uri.fsPath)}...`
  );
  const file_content = doc.getText();
  const origPath = doc.uri.fsPath;
  const { name: basename, dir: dirname } = path.parse(origPath);
  const ext = path.extname(origPath);

  let to_code = false;
  let txtPath = "";
  if (ext == ".py") {
    txtPath = path.join(dirname, `${basename}.psu`);
    to_code = false;
  } else if (ext == ".psu") {
    txtPath = path.join(dirname, `${basename}.py`);
    to_code = true;
  } else {
    vscode.window.showErrorMessage("File is not a python (.py) or pseudo (.psu) code file.");
    return;
  }


  let baseContent = "";
  try {
    baseContent = await fs.readFile(txtPath, "utf8");
    console.log(`Read from ${txtPath}:`, baseContent.length, 'characters');
    // console.log("File does exist, proceeding with diff", baseContent);
  } catch {
    diffString = ""; // if the file doesn't exist, we don't have a diff to apply
    console.log("File doesn't exist, falling back to empty diff");
    // if it doesn't exist yet, we'll fall back to empty
  }

  // let resultObj: { code: string; potential_errors: string[] };
  let resultObj: { code: string; potential_errors: PotentialError[]}; // { file: string; message: string }[] };

  let empty_check = false;
  if (baseContent.length === 0) {
    empty_check = true;
  }

  if (diffString && !empty_check) {
    resultObj = await diffTranslate(baseContent, diffString, to_code, txtPath);
  } else {
    console.log('the file content is empty, falling back to full translate');
    resultObj = await translate(file_content, to_code);
  }

  await fs.writeFile(txtPath, resultObj.code, "utf8");

  vscode.window.showInformationMessage(
    `Transformed ${path.basename(origPath)} to ${path.basename(txtPath)}`
  );

  // Display any potential errors from the model
  // if (resultObj.potential_errors && resultObj.potential_errors.length > 0) {
  //   vscode.window.showWarningMessage(
  //     `⚠ Potential issues:\n${resultObj.potential_errors.join("\n")}`
  //   );
  // }
  if (resultObj.potential_errors?.length) {
    for (const error of resultObj.potential_errors) {
      const fileUri = vscode.Uri.file(error.file);
      const action = await vscode.window.showWarningMessage(
        `⚠ ${error.message}`,
        "Open File"
      );
      if (action === "Open File") {
        vscode.window.showTextDocument(fileUri);
      }
    }
  }
}